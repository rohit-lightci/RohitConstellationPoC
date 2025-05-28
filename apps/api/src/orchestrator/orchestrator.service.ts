import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import {
  Session,
  Participant,
  Question,
} from '@rohit-constellation/types';
import { OptimisticLockVersionMismatchError } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { AnswerService } from '../answer/answer.service';
import { EvaluationService } from '../evaluation/evaluation.service';
import { SessionEventsService } from '../session/session-events.service';
import { SessionService } from '../session/session.service';
import { SessionCacheService } from '../session-cache/session-cache.service';

interface ParticipantQueueCache {
  questions: Question[];
  currentQuestionIndex: number;
  followUpCounts: {
    [baseQuestionId: string]: number;
  };
  // Stores the original order of all base questions from the session template for this participant
  // This helps in re-calculating next base question if needed, without re-filtering the main session object always
  baseQuestionOrder: string[]; 
}

const PQUEUE_CACHE_PREFIX = 'pqueue_';

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);
  private readonly MAX_FOLLOW_UPS = 3;
  private readonly MAX_PROCESS_ANSWER_RETRIES = 3;

  constructor(
    private readonly sessionCacheService: SessionCacheService,
    private readonly evaluationService: EvaluationService,
    @Inject(forwardRef(() => SessionService))
    private readonly sessionService: SessionService,
    private readonly sessionEventsService: SessionEventsService,
    private readonly answerService: AnswerService,
  ) {}

  private getParticipantQueueCacheKey(sessionId: string, participantId: string): string {
    return `${PQUEUE_CACHE_PREFIX}${sessionId}_${participantId}`;
  }

  private async getParticipantQueue(sessionId: string, participantId: string): Promise<ParticipantQueueCache | null> {
    const key = this.getParticipantQueueCacheKey(sessionId, participantId);
    const queueData = this.sessionCacheService['cache'].get<ParticipantQueueCache>(key);
    return queueData || null;
  }

  private async setParticipantQueue(sessionId: string, participantId: string, queueData: ParticipantQueueCache): Promise<void> {
    const key = this.getParticipantQueueCacheKey(sessionId, participantId);
    this.sessionCacheService['cache'].set(key, queueData);
  }

  private async initializeParticipantQueue(session: Session, participant: Participant): Promise<ParticipantQueueCache | null> {
    this.logger.log(`Initializing new queue for P:${participant.id} in S:${session.id}`);
    const allBaseQuestions: Question[] = [];
    const sortedSections = [...session.sections].sort((a, b) => a.order - b.order);
    for (const section of sortedSections) {
      const sortedQuestions = [...section.questions].sort((a, b) => a.order - b.order);
      for (const question of sortedQuestions) {
        if (question.intent === 'BASE') {
          allBaseQuestions.push(question);
        }
      }
    }

    if (allBaseQuestions.length === 0) {
      this.logger.warn(`S:${session.id} has no base questions to initialize queue for P:${participant.id}.`);
      return null;
    }

    const initialQueue: ParticipantQueueCache = {
      questions: [...allBaseQuestions],
      currentQuestionIndex: 0,
      followUpCounts: {},
      baseQuestionOrder: allBaseQuestions.map(q => q.id),
    };

    await this.setParticipantQueue(session.id, participant.id, initialQueue);
    this.logger.log(`Initialized queue for P:${participant.id} with ${allBaseQuestions.length} base questions. First Q: ${allBaseQuestions[0]?.id}`);
    return initialQueue;
  }
  
  private findNextBaseQuestionInQueue(participantQueue: ParticipantQueueCache, currentBaseQuestionId: string): Question | null {
    const currentBaseIndex = participantQueue.baseQuestionOrder.indexOf(currentBaseQuestionId);
    if (currentBaseIndex === -1 || currentBaseIndex === participantQueue.baseQuestionOrder.length - 1) {
      return null;
    }
    const nextBaseQuestionId = participantQueue.baseQuestionOrder[currentBaseIndex + 1];
    return participantQueue.questions.find(q => q.id === nextBaseQuestionId && q.intent === 'BASE') || null;
  }

  private async getSession(sessionId: string): Promise<Session | null> {
    let session = this.sessionCacheService.get(sessionId);
    if (!session) {
      this.logger.log(`Cache miss for session ${sessionId}. Fetching from DB.`);
      const sessionFromDb = await this.sessionService.findOne(sessionId, true); 
      if (sessionFromDb) {
        session = sessionFromDb;
        this.sessionCacheService.set(session);
      } else {
        this.logger.warn(`Session ${sessionId} not found in DB after cache miss.`);
        return null;
      }
    } else {
      // console.log('OrchestratorService: Session from cache', session); // Optional: for heavy debugging
      this.logger.log(`Cache hit for session ${sessionId}.`);
    }
    return session;
  }

  private async persistSession(sessionInput: Session): Promise<void> {
    this.logger.log(`Attempting to persist S:${sessionInput.id} (version ${sessionInput.version})`);
    const updatedSessionFromDb = await this.sessionService.save(sessionInput);
    this.sessionCacheService.set(updatedSessionFromDb); 
    this.logger.log(`Successfully persisted S:${updatedSessionFromDb.id} (new version ${updatedSessionFromDb.version}) to DB and cache.`);
  }

  async processParticipantAnswer(
    sessionId: string,
    participantId: string,
    answeredQuestionId: string,
    response: string | number,
    answerId: string,
  ): Promise<void> {
    this.logger.log(`Orchestrator: Processing answer ${answerId} for P:${participantId}, Q:${answeredQuestionId} in S:${sessionId}.`);
    let retries = 0;
    let participantQueue: ParticipantQueueCache | null = null;
    let newFollowUpQuestionForSessionPersistence: Question | null = null;

    while (retries < this.MAX_PROCESS_ANSWER_RETRIES) {
      let session: Session | null = null;
      let participant: Participant | undefined = undefined;

      try {
        this.logger.log(
          `Attempt #${retries + 1} to process answer for S:${sessionId}, P:${participantId}, Q:${answeredQuestionId}`,
        );

        session = await this.getSession(sessionId);
        if (!session) {
          this.logger.error(`S:${sessionId} not found (Attempt ${retries + 1}). Cannot process answer.`);
          return;
        }

        participant = session.participants.find(p => p.id === participantId);
        if (!participant) {
          this.logger.error(`P:${participantId} not found in S:${sessionId} (Attempt ${retries + 1}). Cannot process answer.`);
          return;
        }
        
        if (!participantQueue) {
          participantQueue = await this.getParticipantQueue(sessionId, participantId);
          if (!participantQueue) {
            this.logger.log(`No existing queue for P:${participantId} (Attempt ${retries + 1}). Initializing...`);
            participantQueue = await this.initializeParticipantQueue(session, participant);
            if (!participantQueue) {
              this.logger.error(`Failed to initialize queue for P:${participantId} (Attempt ${retries + 1}). Cannot process answer.`);
              return;
            }
          }
        }
        
        const currentQuestionFromQueue = participantQueue.questions[participantQueue.currentQuestionIndex];

        if (participant.status === 'COMPLETED') {
          this.logger.warn(`P:${participantId} in S:${sessionId} is COMPLETED. Ignoring answer.`);
          if (currentQuestionFromQueue) {
            this.sessionEventsService.emitQuestionReady(sessionId, participant.id, currentQuestionFromQueue);
          } else {
            this.sessionEventsService.emitParticipantStatus(sessionId, participant.id, 'COMPLETED');
          }
          return;
        }
        
        if (!currentQuestionFromQueue || currentQuestionFromQueue.id !== answeredQuestionId) {
          this.logger.warn(
            `P:${participantId} answered Q:${answeredQuestionId}, but current in queue is Q:${currentQuestionFromQueue?.id}. Re-sending current from queue.`,
          );
          if (currentQuestionFromQueue) {
            this.sessionEventsService.emitQuestionReady(sessionId, participant.id, currentQuestionFromQueue);
          } else {
            this.logger.error(`P:${participantId} has no current question in queue but not completed.`);
            this.sessionEventsService.emitParticipantStatus(sessionId, participant.id, participant.status);
          }
          return;
        }

        const answeredQuestionObject = currentQuestionFromQueue;

        const evaluationResult = await this.evaluationService.evaluateAnswer(
          session,
          participant,
          answeredQuestionObject,
          response,
        );

        let nextQuestion: Question | null = null;
        let participantCompletedSession = false;
        newFollowUpQuestionForSessionPersistence = null;

        if (evaluationResult.isSufficient) {
          this.logger.log(`Answer sufficient for Q:${answeredQuestionObject.id}. Advancing in P-Queue.`);
          participantQueue.currentQuestionIndex++;
          if (participantQueue.currentQuestionIndex < participantQueue.questions.length) {
            nextQuestion = participantQueue.questions[participantQueue.currentQuestionIndex];
          } else {
            participantCompletedSession = true;
          }
        } else { 
          this.logger.log(`Answer insufficient for Q:${answeredQuestionObject.id}. Handling follow-up.`);
          let baseQuestionIdForFollowUp: string;
          let baseQuestionOrderForFollowUp: number;

          if (answeredQuestionObject.intent === 'FOLLOW_UP' && answeredQuestionObject.parentQuestionId) {
            baseQuestionIdForFollowUp = answeredQuestionObject.parentQuestionId;
            const originalBaseQ = participantQueue.questions.find(q => q.id === baseQuestionIdForFollowUp && q.intent === 'BASE');
            baseQuestionOrderForFollowUp = originalBaseQ ? originalBaseQ.order : answeredQuestionObject.order - 0.01;
          } else { 
            baseQuestionIdForFollowUp = answeredQuestionObject.id;
            baseQuestionOrderForFollowUp = answeredQuestionObject.order;
          }
          
          participantQueue.followUpCounts[baseQuestionIdForFollowUp] = participantQueue.followUpCounts[baseQuestionIdForFollowUp] || 0;
          const currentFollowUpCountForBase = participantQueue.followUpCounts[baseQuestionIdForFollowUp];

          if (currentFollowUpCountForBase < this.MAX_FOLLOW_UPS) {
            const followUpPromptText = `Follow-up for original question: Please elaborate on your answer to "${answeredQuestionObject.text.substring(0,50)}...".`;
            const newFollowUpOrder = parseFloat((baseQuestionOrderForFollowUp + (currentFollowUpCountForBase + 1) / 100).toFixed(4));
            
            const generatedFollowUp: Question = {
              id: uuidv4(),
              text: followUpPromptText,
              type: answeredQuestionObject.type,
              intent: 'FOLLOW_UP',
              sectionId: answeredQuestionObject.sectionId,
              parentQuestionId: baseQuestionIdForFollowUp,
              generatedForParticipantId: participant.id,
              order: newFollowUpOrder,
            };
            newFollowUpQuestionForSessionPersistence = generatedFollowUp;

            participantQueue.questions.splice(participantQueue.currentQuestionIndex + 1, 0, newFollowUpQuestionForSessionPersistence);
            participantQueue.followUpCounts[baseQuestionIdForFollowUp]++;
            participantQueue.currentQuestionIndex++; 
            nextQuestion = newFollowUpQuestionForSessionPersistence;
            this.logger.log(`Generated FU Q:${nextQuestion.id} for P:${participant.id}. Will be added to session persistence.`);
          } else {
            this.logger.log(`Max follow-ups (${this.MAX_FOLLOW_UPS}) reached for base Q:${baseQuestionIdForFollowUp}. Advancing in P-Queue.`);
            participantQueue.currentQuestionIndex++;
            if (participantQueue.currentQuestionIndex < participantQueue.questions.length) {
              nextQuestion = participantQueue.questions[participantQueue.currentQuestionIndex];
            } else {
              participantCompletedSession = true;
            }
          }
        }

        // ---- START: Similarity Search Logic ----
        try {
          const currentAnswerEntity = await this.answerService.findOne(answerId);
          if (currentAnswerEntity && currentAnswerEntity.embedding && currentAnswerEntity.embedding !== '[]') { // Add zero vector check from AnswerService if available
            this.logger.log(`Answer ${answerId} has an embedding. Performing similarity search.`);
            const similarAnswers = await this.answerService.findSimilarAnswers(
              currentAnswerEntity.embedding,
              5, 
              sessionId,
              answerId 
            );
            if (similarAnswers && similarAnswers.length > 0) {
              this.logger.log(`Found ${similarAnswers.length} similar answers to A:${answerId}. IDs: ${similarAnswers.map(a => a.id).join(', ')}`);
            } else {
              this.logger.log(`No similar answers found for A:${answerId}.`);
            }
          } else {
            this.logger.log(`Answer ${answerId} does not have a valid embedding yet or it is a zero vector. Skipping similarity search.`);
          }
        } catch (simSearchError) {
          this.logger.error(`Error during similarity search for answer ${answerId}: ${simSearchError instanceof Error ? simSearchError.message : String(simSearchError)}`);
        }
        // ---- END: Similarity Search Logic ----

        if (newFollowUpQuestionForSessionPersistence) {
          const sectionToUpdate = session.sections.find(s => s.id === newFollowUpQuestionForSessionPersistence!.sectionId);
          if (sectionToUpdate) {
            sectionToUpdate.questions.push(newFollowUpQuestionForSessionPersistence);
            sectionToUpdate.questions.sort((a,b) => a.order - b.order);
            this.logger.log(`Added generated FU Q:${newFollowUpQuestionForSessionPersistence.id} to section ${sectionToUpdate.id} for persistence.`);
          } else {
            this.logger.error(`Could not find section ${newFollowUpQuestionForSessionPersistence.sectionId} to add FU question.`);
          }
        }
        
        if (participantCompletedSession) {
          participant.status = 'COMPLETED';
          this.logger.log(`P:${participant.id} in S:${sessionId} has completed all questions.`);
        } else {
          participant.currentQuestion = nextQuestion?.id || ''; // Assign question ID or empty string
        }
        // participant.version +=1; // Removed: Participant type doesn't have version
        session.version +=1;
        
        await this.persistSession(session);
        await this.setParticipantQueue(sessionId, participantId, participantQueue);

        // Corrected emitParticipantStatus call
        this.sessionEventsService.emitParticipantStatus(sessionId, participant.id, participant.status);
        // Removed emitSessionStateToAll as it doesn't exist on SessionEventsService.
        // Session state updates will be handled by specific events or by session completion flow.

        if (participantCompletedSession) {
          this.logger.log(`P:${participantId} COMPLETED. Emitting ParticipantStatus.`);
          // emitParticipantStatus already called above, no need to repeat unless a different status is needed.
          // this.sessionEventsService.emitParticipantStatus(sessionId, participant.id, 'COMPLETED'); 
          if (session.participants.every(p => p.status === 'COMPLETED')) {
            this.logger.log(`All participants in S:${sessionId} have completed. Completing session.`);
            await this.sessionService.completeSession(sessionId); 
          }
        } else if (nextQuestion) {
          this.logger.log(`Next question for P:${participantId} is Q:${nextQuestion.id}. Emitting QuestionReady.`);
          this.sessionEventsService.emitQuestionReady(sessionId, participantId, nextQuestion);
        } else {
          this.logger.error(`P:${participantId} is not completed, but no next question was determined. This should not happen.`);
          this.sessionEventsService.emitParticipantStatus(sessionId, participantId, participant.status); 
        }
        
        return; 
      } catch (error) {
        if (error instanceof OptimisticLockVersionMismatchError) {
          this.logger.warn(
            `Optimistic lock error for S:${sessionId} (Attempt ${retries + 1}). Retrying operation...`,
          );
          retries++;
          participantQueue = null; 
          if (retries >= this.MAX_PROCESS_ANSWER_RETRIES) {
            this.logger.error(
              `Max retries reached for S:${sessionId} due to optimistic lock. Answer processing failed. P:${participantId}, Q:${answeredQuestionId}`,
            );
            // Replaced emitErrorToParticipant with logging
            this.logger.error(`[User Error] Failed to process answer for P:${participantId} due to a server conflict. (S:${sessionId}, Q:${answeredQuestionId})`);
            return;
          }
        } else {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Unexpected error processing answer for S:${sessionId}, P:${participantId}, Q:${answeredQuestionId} (Attempt ${retries + 1}): ${errorMessage}`,
            error instanceof Error ? error.stack : undefined
          );
          // Replaced emitErrorToParticipant with logging
          this.logger.error(`[User Error] An unexpected error occurred while processing answer for P:${participantId}. (S:${sessionId}, Q:${answeredQuestionId})`);
          return; 
        }
      }
    }
  }

  async getNextQuestionForParticipant(sessionId: string, participantId: string): Promise<Question | null> {
    this.logger.log(`Orchestrator: Getting next question for P:${participantId} in S:${sessionId}`);
    const session = await this.getSession(sessionId);
    if (!session) {
      this.logger.error(`S:${sessionId} not found. Cannot get next question.`);
      return null;
    }

    const participant = session.participants.find(p => p.id === participantId);
    if (!participant) {
      this.logger.error(`P:${participantId} not found in S:${sessionId}. Cannot get next question.`);
      return null;
    }
    
    if (participant.status === 'COMPLETED') {
      this.logger.log(`P:${participantId} is already COMPLETED. No next question.`);
      this.sessionEventsService.emitParticipantStatus(sessionId, participantId, 'COMPLETED');
      return null;
    }

    let participantQueue = await this.getParticipantQueue(sessionId, participantId);
    if (!participantQueue || participantQueue.questions.length === 0 || participantQueue.currentQuestionIndex >= participantQueue.questions.length) {
      this.logger.log(`No existing or valid queue for P:${participantId}. Initializing/Re-initializing...`);
      participantQueue = await this.initializeParticipantQueue(session, participant);
      if (!participantQueue) {
        this.logger.error(`Failed to initialize queue for P:${participantId}. Cannot determine next question.`);
        this.sessionEventsService.emitParticipantStatus(sessionId, participantId, participant.status); 
        return null;
      }
    }
    
    const nextQuestion = participantQueue.questions[participantQueue.currentQuestionIndex];
    
    if (nextQuestion) {
        this.logger.log(`Next question for P:${participantId} is Q:${nextQuestion.id} from queue index ${participantQueue.currentQuestionIndex}.`);
        // Ensure participant.currentQuestion is updated before emitting, though processParticipantAnswer should handle primary state changes.
        // participant.currentQuestion = nextQuestion.id; // This might be redundant if processParticipantAnswer is the sole mutator.
        this.sessionEventsService.emitQuestionReady(sessionId, participantId, nextQuestion);
        return nextQuestion;
    } else {
        this.logger.warn(`P:${participantId} in S:${sessionId}: No next question found in queue, but status is not COMPLETED. This might indicate end of queue.`);
        if(participantQueue.currentQuestionIndex >= participantQueue.questions.length ){
            participant.status = 'COMPLETED';
            participant.currentQuestion = ''; // Clear current question
            try {
              session.version += 1;
              // participant.version +=1; // Removed
              await this.persistSession(session);
              await this.setParticipantQueue(sessionId, participantId, participantQueue);
              this.sessionEventsService.emitParticipantStatus(sessionId, participant.id, 'COMPLETED');
              // No emitSessionStateToAll here directly
              this.logger.log(`P:${participantId} marked COMPLETED in getNextQuestion as end of queue was reached.`);
            } catch (error) {
              this.logger.error(`Error persisting COMPLETED status for P:${participantId} in getNextQuestion: ${error}`);
            }
        }
        return null;
    }
  }

  private findQuestionById(session: Session, questionId: string): Question | undefined {
    if (!questionId) return undefined;
    for (const section of session.sections) {
      const question = section.questions.find(q => q.id === questionId);
      if (question) return question;
    }
    this.logger.warn(`(Legacy find) Question with ID ${questionId} not found in any section of session ${session.id}`);
    return undefined;
  }
}
