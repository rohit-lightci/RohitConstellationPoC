import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import pgvector from 'pgvector';
import { Repository } from 'typeorm';

// Assuming EMBEDDING_DIMENSION is consistently used, good to import or define it
// For this example, I'll use a locally defined constant.
// Ideally, import { EMBEDDING_DIMENSION } from '../embedding/embedding.service'; if it's exported there.
const EMBEDDING_DIMENSION_FOR_CHECK = 1536;

import { EmbeddingService } from '../embedding/embedding.service';

import { Answer } from './answer.entity';
// Import Session entity if needed for validation, but not strictly for creating an Answer if sessionId is passed.
// import { Session } from '../session/session.entity'; 

@Injectable()
export class AnswerService {
  private readonly logger = new Logger(AnswerService.name);
  private readonly zeroVectorString: string;

  constructor(
    @InjectRepository(Answer)
    private answerRepository: Repository<Answer>,
    private readonly embeddingService: EmbeddingService,
    // @InjectRepository(Session) // If we need to fetch/validate Session here
    // private sessionRepository: Repository<Session>,
  ) {
    this.zeroVectorString = pgvector.toSql(new Array(EMBEDDING_DIMENSION_FOR_CHECK).fill(0.0));
  }

  async create(data: Partial<Answer>): Promise<Answer> {
    const answerEntity = this.answerRepository.create(data);
    const savedAnswer = await this.answerRepository.save(answerEntity);

    const responseText = typeof savedAnswer.response === 'string' ? savedAnswer.response : null;

    if (responseText && responseText.trim() !== '') {
      try {
        await this.generateAndStoreEmbedding(savedAnswer.id, responseText);
      } catch (embeddingError) {
        this.logger.warn(`Embedding generation for answer ${savedAnswer.id} failed in create flow: ${embeddingError}`);
      }
    } else {
      this.logger.warn(`Answer ${savedAnswer.id} response is not a non-empty string or not found. Skipping embedding.`);
    }

    return savedAnswer;
  }

  async findOne(id: string): Promise<Answer | null> {
    return this.answerRepository.findOne({ where: { id } });
  }

  async generateAndStoreEmbedding(answerId: string, textToEmbed: string): Promise<Answer | null> {
    this.logger.log(`Requesting embedding generation for answer ${answerId}...`);
    try {
      const stringEmbedding = await this.embeddingService.generateEmbedding(textToEmbed);
      if (stringEmbedding && stringEmbedding !== this.zeroVectorString) {
        const updatedAnswer = await this.answerRepository.save({
          id: answerId,
          embedding: stringEmbedding,
        });
        this.logger.log(`Successfully generated and stored embedding for answer ${answerId}.`);
        return updatedAnswer;
      } else {
        this.logger.warn(`Embedding generation returned an empty or zero vector for answer ${answerId}. Not updating.`);
        return null;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during embedding generation or storage';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error during embedding generation or storage for answer ${answerId}: ${errorMessage}`, errorStack);
      return null;
    }
  }

  async findSimilarAnswers(
    targetEmbeddingString: string,
    limit: number = 5,
    sessionId?: string,
    excludeAnswerId?: string
  ): Promise<Answer[]> {
    if (!targetEmbeddingString || targetEmbeddingString === '[]' || targetEmbeddingString === this.zeroVectorString) {
      this.logger.warn('Attempted similarity search with an empty or zero target embedding. Returning empty array.');
      return [];
    }

    try {
      const queryBuilder = this.answerRepository.createQueryBuilder('answer');

      queryBuilder.where('answer.embedding IS NOT NULL AND answer.embedding != :zeroVector', { zeroVector: this.zeroVectorString });

      if (sessionId) {
        queryBuilder.andWhere('answer.sessionId = :sessionId', { sessionId });
      }

      if (excludeAnswerId) {
        queryBuilder.andWhere('answer.id != :excludeAnswerId', { excludeAnswerId });
      }

      queryBuilder.orderBy('answer.embedding <-> :embedding', 'ASC');
      queryBuilder.setParameter('embedding', targetEmbeddingString);
      queryBuilder.limit(limit);

      this.logger.log(`Executing similarity search for embedding (first 20 chars): ${targetEmbeddingString.substring(0,20)}...` +
        `${sessionId ? ` in session ${sessionId}` : ''}` +
        `${excludeAnswerId ? ` excluding answer ${excludeAnswerId}` : ''}`);

      const similarAnswers = await queryBuilder.getMany();
      this.logger.log(`Found ${similarAnswers.length} similar answers.`);
      return similarAnswers;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during similarity search';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error finding similar answers: ${errorMessage}`, errorStack);
      return [];
    }
  }

  // We might add other methods here later, e.g., findBySession, findByParticipant, etc.
} 