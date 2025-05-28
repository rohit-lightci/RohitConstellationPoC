import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import pgvector from 'pgvector'; // Import pgvector

// Dimensions for the embedding vector, e.g., 1536 for OpenAI's text-embedding-ada-002
export const EMBEDDING_DIMENSION = 1536;
const OPENAI_EMBEDDING_MODEL = 'text-embedding-ada-002';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY is not configured. Embedding generation will fail.');
      // You might want to throw an error here to prevent the app from starting/misbehaving
      // Or handle this case gracefully in generateEmbedding
      // For now, we'll let it proceed but log an error.
      // this.openai will be undefined, and calls to it will fail.
    } else {
      this.openai = new OpenAI({ apiKey });
    }
  }

  async generateEmbedding(text: string): Promise<string> {
    if (!this.openai) {
      this.logger.error('OpenAI client is not initialized. Cannot generate embeddings.');
      // Fallback to a zero vector string or throw error
      return pgvector.toSql(new Array(EMBEDDING_DIMENSION).fill(0.0));
    }

    if (!text || text.trim() === '') {
      this.logger.warn('Attempted to generate embedding for empty or whitespace text. Returning zero vector string.');
      return pgvector.toSql(new Array(EMBEDDING_DIMENSION).fill(0.0));
    }

    // OpenAI recommends replacing newlines with spaces for better performance.
    const inputText = text.replace(/n/g, ' ');

    try {
      this.logger.log(`Requesting OpenAI embedding for text (model: ${OPENAI_EMBEDDING_MODEL}, first 50 chars): "${inputText.substring(0, 50)}..."`);
      
      const embeddingResponse = await this.openai.embeddings.create({
        model: OPENAI_EMBEDDING_MODEL,
        input: inputText,
      });

      const numericEmbedding: number[] = embeddingResponse.data[0].embedding;

      if (!numericEmbedding || numericEmbedding.length !== EMBEDDING_DIMENSION) {
        this.logger.error('OpenAI embedding response did not return a valid embedding or dimension mismatch.');
        // Fallback to a zero vector string or throw error
        return pgvector.toSql(new Array(EMBEDDING_DIMENSION).fill(0.0));
      }
      
      this.logger.log(`Successfully received embedding from OpenAI for text: "${inputText.substring(0, 50)}..."`);
      return pgvector.toSql(numericEmbedding);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during embedding generation';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error generating embedding from OpenAI for text: "${inputText.substring(0, 50)}...": ${errorMessage}`, errorStack);
      // Fallback to a zero vector string in case of error
      // Consider a more sophisticated retry mechanism or error handling strategy for production
      return pgvector.toSql(new Array(EMBEDDING_DIMENSION).fill(0.0));
    }
  }
} 