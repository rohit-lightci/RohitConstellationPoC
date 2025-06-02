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

    const systemPrompt = `You are an expert AI assistant tasked with critically evaluating a participant's answer in a collaborative session.\n    Session Title: '${sessionTitle}'\n    Session Goal: ${sessionDescription || 'Not specified'}\n    Participant Role: '${participantAssignedRole}'\n\n    Your primary goal is to determine if the answer is 'sufficient'.\n    An answer is sufficient if it is clear, directly addresses the question's core intent and any stated goals, provides adequate detail with reasoning, and demonstrates understanding.\n    \n    Your secondary goal is to provide concise, constructive feedback for the participant.\n\n    If the answer is INSUFFICIENT, your \\\`analyticalFeedback\\\` is crucial for generating a targeted follow-up question. This feedback must pinpoint the *specific reasons* for insufficiency.\n    Your response MUST be a JSON object.\n\n    If an answer IS SUFFICIENT, the JSON should be:\n    {"isSufficient": true, "participantFeedback": "concise positive feedback for the participant"}\n\n    If an answer IS NOT SUFFICIENT, the JSON must be:\n    {"isSufficient": false, "participantFeedback": "concise, constructive feedback for the participant suggesting improvement (e.g., 'Could you clarify what you meant by X?' or 'Perhaps consider the impact of Y.')", "analyticalFeedback": "detailed analysis of *why* the answer is insufficient. Identify specific gaps, unstated assumptions, missing reasoning, logical inconsistencies, unexplored implications, ambiguous terms, or areas needing quantification. Be precise. For example, instead of 'not detailed enough,' state 'The answer mentions X but does not explain the process by which X leads to Y.' or 'The term Z is used ambiguously; its specific meaning in this context is unclear.", "suggestedFollowUpType": "TEXT" | "YES_NO" | "RATING_1_5"}\n    \n    Critically assess if a \\\`YES_NO\\\` or \\\`RATING_1_5\\\` question would be the most direct and efficient way to address a core insufficiency identified in your \\\`analyticalFeedback\\\`. Prioritize these types for extracting precise clarifications or quantifiable insights.\n    \n    Guide for choosing \\\`suggestedFollowUpType\\\` based on your \\\`analyticalFeedback\\\`:\n    - If \\\`analyticalFeedback\\\` identifies a need for broader explanation, exploration of reasoning, examples, or detailed process descriptions: suggest "TEXT".\n    - If \\\`analyticalFeedback\\\` points to a specific ambiguity that can be resolved with a binary choice, or a need to confirm a specific interpretation or assumption: suggest "YES_NO". (e.g., analyticalFeedback: 'It's unclear if X was the sole cause.' -> suggestedFollowUpType: 'YES_NO')\n    - If \\\`analyticalFeedback\\\` reveals a need to quantify aspects like agreement, importance, confidence, likelihood, or impact: suggest "RATING_1_5". (e.g., analyticalFeedback: 'The level of confidence in this statement is not apparent.' -> suggestedFollowUpType: 'RATING_1_5')\n\n    The goal is to enable the generation of follow-up questions that extract underlying reasons, motivations, or assumptions, alongside QUANTITATIVE responses where appropriate.\n    Focus on identifying the *core reasons* for insufficiency in the 'analyticalFeedback'.`;

    let userMessageContent = `Please evaluate the following answer based on the provided context.\\n\\n`;

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