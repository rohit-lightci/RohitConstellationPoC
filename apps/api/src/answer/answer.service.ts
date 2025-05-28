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

// New interface for return type
export interface SimilarAnswerWithDistance extends Answer {
  distance: number;
}

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
    excludeAnswerId?: string,
    excludeParticipantId?: string // New parameter
  ): Promise<SimilarAnswerWithDistance[]> { // Updated return type
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

      // New: Exclude answers from a specific participant
      if (excludeParticipantId) {
        queryBuilder.andWhere('answer.participantId != :excludeParticipantId', { excludeParticipantId });
      }

      // New: Select the distance and give it an alias 'distance'
      // The <-> operator in pgvector provides distance.
      queryBuilder.addSelect('answer.embedding <-> :embedding', 'distance');
      queryBuilder.orderBy('distance', 'ASC'); // Order by the calculated distance
      queryBuilder.setParameter('embedding', targetEmbeddingString);
      queryBuilder.limit(limit);

      let logMessage = `Executing similarity search for embedding (first 20 chars): ${targetEmbeddingString.substring(0,20)}...`;
      if (sessionId) logMessage += ` in session ${sessionId}`;
      if (excludeAnswerId) logMessage += ` excluding answer ${excludeAnswerId}`;
      if (excludeParticipantId) logMessage += ` excluding participant ${excludeParticipantId}`;
      this.logger.log(logMessage);

      // Use getRawMany to ensure the 'distance' field is included and correctly typed.
      // TypeORM's getMany() might not always attach custom selected fields directly to entities.
      const rawResults: (Answer & { distance: string | number })[] = await queryBuilder.getRawMany();
      
      // Manually map raw results to ensure correct structure and type for distance.
      // pgvector distances are usually numbers, but getRawMany might return string initially.
      const results = rawResults.map(raw => {
        const entityPart = {
          id: raw['answer_id'],
          questionId: raw['answer_questionId'],
          participantId: raw['answer_participantId'],
          response: raw['answer_response'],
          createdAt: raw['answer_createdAt'],
          sessionId: raw['answer_sessionId'],
          embedding: raw['answer_embedding'],
          // Note: related 'session' object is not loaded here to keep it simple
        };
        return {
          ...(this.answerRepository.create(entityPart as Partial<Answer>)), // Hydrate to get methods if any, or just use entityPart
          distance: parseFloat(raw.distance as string), // Ensure distance is a number
        } as SimilarAnswerWithDistance;
      });

      this.logger.log(`Found ${results.length} similar answers.`);
      return results;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during similarity search';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error finding similar answers: ${errorMessage}`, errorStack);
      return [];
    }
  }

  // We might add other methods here later, e.g., findBySession, findByParticipant, etc.
} 