import { Injectable, Logger } from '@nestjs/common';
import { Question } from '@rohit-constellation/types';
import OpenAI from 'openai'; // Import OpenAI type

import { LLMService } from '../llm/llm.service'; // Import LLMService

interface LLMEvaluationResponse {
  isSufficient: boolean;
  feedback: string;
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
  ): Promise<{ isSufficient: boolean; feedback?: string; score?: number }> {
    this.logger.log(
      `Evaluating P-Role:${participantAssignedRole}'s answer to Q:${question.id} (Intent: ${question.intent}) in Session:"${sessionTitle}" (Response: ${response}) using LLM.`, 
    );

    const systemPrompt = `You are an AI assistant evaluating the sufficiency of a participant's answer to a question within a collaborative session.
    The overall goal of this session (titled '${sessionTitle}') is: ${sessionDescription || 'Not specified'}.
    The participant submitting this answer has the role of '${participantAssignedRole}'.
    Your goal it determine the qualitaive OR quantitative measure of the answer and understand WHY and core of the problem to get more insights.
Your response MUST be a JSON object with the following structure: {"isSufficient": boolean, "feedback": "string"}. 
- 'isSufficient' should be true if the answer adequately addresses the question(s) and its goals, and false otherwise.
- 'feedback' should be a concise message for the participant, explaining why the answer was deemed sufficient or insufficient, or suggesting areas for improvement if applicable.`;

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
    userMessageContent += `\nParticipant's Answer: "${response}"\n\nIs this answer sufficient given the question(s) and goals? Provide feedback. Remember to respond only with the specified JSON object.`;

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
          feedback: 'Automated evaluation could not be performed at this time. Please ensure your answer is comprehensive.'
        };
      }

      this.logger.debug(`LLM Raw Response for evaluation: ${llmResponseString}`);
      const parsedResponse: LLMEvaluationResponse = JSON.parse(llmResponseString);

      if (typeof parsedResponse.isSufficient !== 'boolean' || typeof parsedResponse.feedback !== 'string') {
        this.logger.error('LLM response for evaluation is not in the expected JSON format.', parsedResponse);
        return { 
          isSufficient: false, 
          feedback: 'Automated evaluation result was unclear. Please ensure your answer is comprehensive.'
        };    
      }
      
      this.logger.log(`LLM Evaluation for Q:${question.id} - Sufficient: ${parsedResponse.isSufficient}, Feedback: ${parsedResponse.feedback}`);
      return parsedResponse;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during LLM evaluation';
      this.logger.error(`Error during LLM evaluation for Q:${question.id}: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
      return { 
        isSufficient: false, 
        feedback: 'An error occurred during automated evaluation. Please ensure your answer is thorough.'
      };
    }
  }
} 