import { Injectable, Logger } from '@nestjs/common';
import { Question } from '@rohit-constellation/types';
import OpenAI from 'openai'; // Import OpenAI type

import { LLMService } from '../llm/llm.service'; // Import LLMService

interface LLMEvaluationResponse {
  isSufficient: boolean;
  participantFeedback: string; // Renamed from 'feedback'
  analyticalFeedback?: string; // New optional field for detailed analysis
  suggestedFollowUpType?: 'TEXT' | 'YES_NO' | 'RATING_1_5'; // New field
  // score?: number; // Optional: if you want the LLM to provide a score
}

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);
  // private readonly MAKE_ANSWER_SUFFICIENT = false; // No longer needed if we always use LLM

  constructor(private readonly llmService: LLMService) {} // Inject LLMService

  async evaluateAnswer(
    sessionTitle: string,
    sessionDescription: string | undefined,
    participantAssignedRole: string, // 'PARTICIPANT' or 'HOST'
    question: Question, // Current question being answered
    response: string | number,
    originalQuestionTextContext?: string, // Text of the ultimate base question if current is a follow-up
    sectionGoalContext?: string // Goal of the current section
  ): Promise<{ isSufficient: boolean; participantFeedback: string; analyticalFeedback?: string; score?: number, suggestedFollowUpType?: 'TEXT' | 'YES_NO' | 'RATING_1_5' }> {
    this.logger.log(
      `Evaluating P-Role:${participantAssignedRole}'s answer to Q:${question.id} (Intent: ${question.intent}) in Session:"${sessionTitle}" (Response: ${response}) using LLM.`, 
    );

    const systemPrompt = `You are an expert AI assistant tasked with critically evaluating a participant's answer in a collaborative session.
    Session Title: '${sessionTitle}'
    Session Goal: ${sessionDescription || 'Not specified'}
    Participant Role: '${participantAssignedRole}'

    Your primary goal is to determine if the answer is 'sufficient'.
    An answer is sufficient if it is clear, addresses the question's core intent and any stated goals, provides adequate detail, and demonstrates understanding.
    Your goals is provide a concise, constructive feedback for the participant suggesting improvement which can lead to quantive responses such as yes/no or rating.

    If the answer is INSUFFICIENT, your feedback is crucial for generating a targeted follow-up question.
    Your response MUST be a JSON object.

    If an answer IS SUFFICIENT, the JSON should be:
    {"isSufficient": true, "participantFeedback": "concise positive feedback for the participant"}

    If an answer IS NOT SUFFICIENT, the JSON must be:
    {"isSufficient": false, "participantFeedback": "concise, constructive feedback for the participant suggesting improvement", "analyticalFeedback": "detailed analysis of *why* the answer is insufficient. Pinpoint specific gaps, missing information, areas lacking depth, or unaddressed parts of the question/goals. This analysis will be used to formulate a follow-up question.", "suggestedFollowUpType": "TEXT" | "YES_NO" | "RATING_1_5"}
    
    When suggesting a follow-up type:
    - Suggest "TEXT" if the participant needs to elaborate broadly, explain reasoning, or provide more detailed examples.
    - Suggest "YES_NO" if a quick, specific confirmation or a binary clarification on a particular point from their answer is most efficient.
    - Suggest "RATING_1_5" if a quantifiable measure of agreement, importance, satisfaction, confidence, or impact would be beneficial to understand their stance better.

    The goal is to extract underlying reasons, motivations, or assumptions along with QUANTITATIVE responses.

    Focus on identifying the *core reasons* for insufficiency in the 'analyticalFeedback'.
    
    If needed, you can also ask a yes/no question or a rating question to the participant to get more quantitative information.`;

    let userMessageContent = `Please evaluate the following answer based on the provided context.\n\n`;

    if (originalQuestionTextContext && question.intent === 'FOLLOW_UP') {
      userMessageContent += `Original Base Question: "${originalQuestionTextContext}"\n`;
      userMessageContent += `Current Follow-up Question Asked: "${question.text}"\n`;
    } else {
      userMessageContent += `Question Asked: "${question.text}"\n`;
    }

    if (question.goal) {
      userMessageContent += `Specific Goal of this Question: "${question.goal}"\n`;
    }
    if (sectionGoalContext) {
      userMessageContent += `Goal of the Current Section: "${sectionGoalContext}"\n`;
    }
    userMessageContent += `\nParticipant's Answer: "${response}"\n\nBased on the instructions, evaluate if this answer is sufficient and provide the required feedback in the specified JSON format.`;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessageContent },
    ];

    // console.log('messages >>>>>>>>>>>>>>', messages); // Keep for debugging if needed

    try {
      const llmResponseString = await this.llmService.generateChatCompletion(messages);

      if (!llmResponseString) {
        this.logger.error('LLM returned no response string for evaluation.');
        return {
          isSufficient: false,
          participantFeedback: 'Automated evaluation could not be performed at this time. Please ensure your answer is comprehensive.',
          suggestedFollowUpType: 'TEXT' // Default suggestion on error
        };
      }

      this.logger.debug(`LLM Raw Response for evaluation: ${llmResponseString}`);
      const parsedResponse: LLMEvaluationResponse = JSON.parse(llmResponseString);

      if (typeof parsedResponse.isSufficient !== 'boolean' || typeof parsedResponse.participantFeedback !== 'string') {
        this.logger.error('LLM response for evaluation is not in the expected JSON format (missing isSufficient or participantFeedback).', parsedResponse);
        return {
          isSufficient: false,
          participantFeedback: 'Automated evaluation result was unclear. Please ensure your answer is comprehensive.',
          suggestedFollowUpType: 'TEXT' // Default suggestion on error
        };
      }
      
      this.logger.log(`LLM Evaluation for Q:${question.id} - Sufficient: ${parsedResponse.isSufficient}, ParticipantFeedback: ${parsedResponse.participantFeedback}, AnalyticalFeedback: ${parsedResponse.analyticalFeedback || 'N/A'}, SuggestedFollowUpType: ${parsedResponse.suggestedFollowUpType || 'N/A'}`);
      return {
        isSufficient: parsedResponse.isSufficient,
        participantFeedback: parsedResponse.participantFeedback,
        analyticalFeedback: parsedResponse.analyticalFeedback,
        suggestedFollowUpType: parsedResponse.suggestedFollowUpType,
        // score: parsedResponse.score // if you re-introduce score
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during LLM evaluation';
      this.logger.error(`Error during LLM evaluation for Q:${question.id}: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
      return {
        isSufficient: false,
        participantFeedback: 'An error occurred during automated evaluation. Please ensure your answer is thorough.',
        suggestedFollowUpType: 'TEXT' // Default suggestion on error
      };
    }
  }
} 