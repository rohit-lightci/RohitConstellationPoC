import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private openai: OpenAI | null = null;
  private readonly defaultModel = 'gpt-3.5-turbo'; // Or your preferred default

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.error(
        'OPENAI_API_KEY is not configured. LLMService will not be able to make API calls.',
      );
    } else {
      this.openai = new OpenAI({ apiKey });
      this.logger.log('OpenAI client initialized successfully for LLMService.');
    }
  }

  /**
   * Generates a chat completion using the OpenAI API.
   * @param messages An array of message objects, following OpenAI's chat format.
   * @param model Optional. The model to use (e.g., 'gpt-4', 'gpt-3.5-turbo'). Defaults to `this.defaultModel`.
   * @param temperature Optional. Controls randomness. Lower is more deterministic.
   * @returns The content of the assistant's response, or null if an error occurs or client not initialized.
   */
  async generateChatCompletion(
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    model?: string,
    temperature: number = 0.7, // Default temperature
  ): Promise<string | null> {
    if (!this.openai) {
      this.logger.error('OpenAI client is not initialized. Cannot generate chat completion.');
      return null;
    }

    const targetModel = model || this.defaultModel;

    try {
      this.logger.log(`Requesting chat completion from model: ${targetModel} with ${messages.length} messages.`);
      const completion = await this.openai.chat.completions.create({
        model: targetModel,
        messages,
        temperature,
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        this.logger.warn('Received no content in chat completion response.', completion);
        return null;
      }
      this.logger.log('Successfully received chat completion.');
      return responseContent.trim();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown OpenAI API error';
      this.logger.error(
        `Error generating chat completion from model ${targetModel}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }
} 