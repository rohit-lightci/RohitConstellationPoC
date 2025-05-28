import { Injectable, Logger } from '@nestjs/common';
import { Session, Participant, Question } from '@rohit-constellation/types';
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

  private findQuestionById(session: Session, questionId: string): Question | undefined {
    // Helper to find the original base question for context
    for (const section of session.sections) {
      const found = section.questions.find(q => q.id === questionId);
      if (found) return found;
    }
    // Check session-level generated questions if any (though typically questions are in sections)
    // This part might need adjustment based on where all questions could be stored.
    // For now, assuming questions are always within sections as per current session structure.
    return undefined;
  }

  async evaluateAnswer(
    session: Session,
    participant: Participant,
    question: Question,
    response: string | number,
  ): Promise<{ isSufficient: boolean; feedback?: string; score?: number }> {
    this.logger.log(
      `Evaluating P:${participant.id}'s answer to Q:${question.id} (Intent: ${question.intent}) in S:${session.id} (Response: ${response}) using LLM.`, 
    );

    // // Removed: We now evaluate follow-up answers as well.
    // if (question.intent === 'FOLLOW_UP') {
    //   this.logger.log(`Q:${question.id} is a FOLLOW_UP. Marking as sufficient by default.`);
    //   return { isSufficient: true, feedback: 'Follow-up answer processed.' };
    // }

    const section = session.sections.find(s => s.id === question.sectionId);
    let originalQuestionText: string | undefined = undefined;

    if (question.intent === 'FOLLOW_UP' && question.parentQuestionId) {
      const originalQuestion = this.findQuestionById(session, question.parentQuestionId);
      if (originalQuestion) {
        originalQuestionText = originalQuestion.text;
        this.logger.log(`Current question Q:${question.id} is a follow-up to Q:${question.parentQuestionId} ("${originalQuestionText}")`);
      } else {
        this.logger.warn(`Could not find parent question ${question.parentQuestionId} for follow-up Q:${question.id}`);
      }
    }

    const systemPrompt = `You are an AI assistant evaluating the sufficiency of a participant's answer to a question within a collaborative session.
    Your goal it determine the qualitaive OR quantitative measure of the answer and understand WHY and core of the problem to get more insights.
Your response MUST be a JSON object with the following structure: {"isSufficient": boolean, "feedback": "string"}. 
- 'isSufficient' should be true if the answer adequately addresses the question(s) and its goals, and false otherwise.
- 'feedback' should be a concise message for the participant, explaining why the answer was deemed sufficient or insufficient, or suggesting areas for improvement if applicable.`;

    let userMessageContent = `Please evaluate the following answer based on the provided context.

`;

    if (originalQuestionText) {
      userMessageContent += `Original Question: "${originalQuestionText}"\n`;
      userMessageContent += `Current Follow-up Question: "${question.text}"\n`;
    } else {
      userMessageContent += `Question: "${question.text}"\n`;
    }

    if (question.goal) {
      userMessageContent += `Question Goal: "${question.goal}"\n`;
    }
    if (section?.goal) {
      userMessageContent += `Section Goal: "${section.goal}"\n`;
    }
    userMessageContent += `
Participant's Answer: "${response}"

Is this answer sufficient given the question(s) and goals? Provide feedback. Remember to respond only with the specified JSON object.`;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessageContent },
    ];

    console.log('messages >>>>>>>>>>>>>>', messages);

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