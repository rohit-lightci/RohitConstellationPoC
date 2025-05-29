import { Injectable, Logger } from '@nestjs/common';
import { Section as TypesSection, SectionType, QuestionIntent } from '@rohit-constellation/types';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { v4 as uuidv4 } from 'uuid';

import { LLMService } from '../llm/llm.service';

@Injectable()
export class PromptContentGenerationService {
  private readonly logger = new Logger(PromptContentGenerationService.name);

  constructor(private readonly llmService: LLMService) {}

  async generateSessionContent(prompt: string): Promise<{ sections: TypesSection[] }> {
    this.logger.log(`Generating session content for user prompt: "${prompt}" using LLMService.`);

    const systemPrompt = `
      You are an assistant that helps create session structures for collaborative meetings based on a user's prompt.
      The user will provide a topic or goal, and you need to generate a JSON array of sections.
      Each section object in the array must have the following properties:
      - "name": string (e.g., "Key Discussion Points", "Brainstorming Solutions", "Action Items")
      - "goal": string (a brief description of what the section aims to achieve)
      - "questions": an array of question objects. Each question object must have:
        - "text": string (the base question for that section)

      Generate 2 to 4 sections. Each section should have 1 to 2 base questions.
      The questions should be open-ended and designed to facilitate discussion or gather information related to the section's name and goal, based on the user's prompt.
      Ensure your entire response is ONLY the JSON array of sections, with no other text before or after it.
    `;

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ];

    try {
      this.logger.log('Sending request to LLMService for chat completion...');
      const responseContent = await this.llmService.generateChatCompletion(
        messages,
        'gpt-3.5-turbo-1106',
        0.5,
      );

      if (!responseContent) {
        this.logger.error('LLMService returned null or empty response content.');
        throw new Error('LLMService failed to provide content for session generation.');
      }

      this.logger.debug(`Raw LLMService response string: ${responseContent}`);

      let generatedData: Array<{ name: string; goal: string; questions: Array<{ text: string }> }> = [];
      try {
        generatedData = JSON.parse(responseContent);
      } catch (parseError) {
        this.logger.warn('Failed to parse LLMService response directly as JSON. Attempting to extract from markdown.', parseError);
        const jsonRegex = /```json\n(.*\n)*?.*\n```/s;
        const match = responseContent.match(jsonRegex);
        if (match && match[1]) {
          this.logger.log('Attempting to parse extracted JSON from markdown (LLMService response).');
          try {
            generatedData = JSON.parse(match[1]);
          } catch (nestedParseError) {
            this.logger.error('Failed to parse extracted JSON from LLMService response as well.', nestedParseError);
            throw new Error('LLMService response was not valid JSON, even after attempting to extract from markdown.');
          }
        } else {
          this.logger.error('LLMService response was not valid JSON and no markdown JSON block found.', { originalResponse: responseContent });
          throw new Error('LLMService response was not valid JSON and no markdown JSON block found.');
        }
      }

      const sections: TypesSection[] = generatedData.map((item, index) => {
        const sectionId = uuidv4();
        return {
          id: sectionId,
          name: item.name,
          type: 'CUSTOM' as SectionType,
          order: index + 1,
          goal: item.goal,
          timeLimit: 10,
          status: 'PENDING',
          questions: item.questions.map((q, qIndex) => ({
            id: uuidv4(),
            type: 'TEXT',
            text: q.text,
            sectionId: sectionId,
            order: qIndex + 1,
            intent: 'BASE' as QuestionIntent,
          })),
          startedAt: undefined,
          completedAt: undefined,
        };
      });

      this.logger.log(`Successfully generated ${sections.length} sections from prompt via LLMService.`);
      return { sections };

    } catch (error) {
      const specificMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error in PromptContentGenerationService using LLMService: ${specificMessage}`, error instanceof Error ? error.stack : undefined);
      throw new Error(`Failed to generate session content via LLMService: ${specificMessage}`);
    }
  }
} 