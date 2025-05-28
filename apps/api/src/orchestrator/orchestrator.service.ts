import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import {
  Session,
  Participant,
  Question,
} from '@rohit-constellation/types';
import OpenAI from 'openai';
import { OptimisticLockVersionMismatchError } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { AnswerService } from '../answer/answer.service';
import { EvaluationService } from '../evaluation/evaluation.service';
import { LLMService } from '../llm/llm.service';
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
    private readonly llmService: LLMService,
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
    let sessionData = this.sessionCacheService.get(sessionId);
    if (!sessionData) {
      this.logger.log(`Cache miss for session ${sessionId}. Fetching from DB.`);
      const sessionFromDb = await this.sessionService.findOne(sessionId, true); 
      if (sessionFromDb) {
        sessionData = sessionFromDb;
        this.sessionCacheService.set(sessionData);
      } else {
        this.logger.warn(`Session ${sessionId} not found in DB after cache miss.`);
        return null;
      }
    } else {
      // console.log('OrchestratorService: Session from cache', session); // Optional: for heavy debugging
      this.logger.log(`Cache hit for session ${sessionId}.`);
    }
    return sessionData;
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
          this.logger.log(`Answer to Q:${answeredQuestionObject.id} by P:${participantId} was insufficient. Feedback: "${evaluationResult.feedback}". Handling follow-up.`);
          let baseQuestionIdForFollowUp: string;
          let baseQuestionOrderForFollowUp: number;
          // Variable to hold the text of the original base question for LLM prompt context
          let originalBaseQuestionTextForLLMPrompt: string | undefined = answeredQuestionObject.text; 

          if (answeredQuestionObject.intent === 'FOLLOW_UP' && answeredQuestionObject.parentQuestionId) {
            baseQuestionIdForFollowUp = answeredQuestionObject.parentQuestionId;
            // Find the original base question from the session data for its text
            const originalBaseQFromSession = this.findQuestionInSessionById(session, baseQuestionIdForFollowUp);
            if (originalBaseQFromSession) originalBaseQuestionTextForLLMPrompt = originalBaseQFromSession.text;
            // Use order from session data, or fallback if somehow not found (should be rare)
            baseQuestionOrderForFollowUp = originalBaseQFromSession ? originalBaseQFromSession.order : (answeredQuestionObject.order - 0.01);
          } else { 
            baseQuestionIdForFollowUp = answeredQuestionObject.id;
            baseQuestionOrderForFollowUp = answeredQuestionObject.order;
            // For a base question, its own text is the "original" context for the first follow-up
            originalBaseQuestionTextForLLMPrompt = answeredQuestionObject.text; 
          }
          
          participantQueue.followUpCounts[baseQuestionIdForFollowUp] = participantQueue.followUpCounts[baseQuestionIdForFollowUp] || 0;
          const currentFollowUpCountForBase = participantQueue.followUpCounts[baseQuestionIdForFollowUp];

          if (currentFollowUpCountForBase < this.MAX_FOLLOW_UPS) {
            this.logger.log(`Attempting to generate LLM follow-up for P:${participantId}, BaseQ:${baseQuestionIdForFollowUp} (Follow-up attempt ${currentFollowUpCountForBase + 1})`);

            const llmSystemPrompt = "You are a helpful session facilitator. Your goal is to generate a concise follow-up question to elicit more specific or complete information from a participant after their previous answer was deemed insufficient. The question should be direct and easy to understand.";
            
            let llmUserPrompt = `The participant just answered a question, but their answer was not sufficient. Please generate a follow-up question for them.\n\n`;
            if (answeredQuestionObject.intent === 'FOLLOW_UP') {
                llmUserPrompt += `Context: The participant is responding to a series of questions. The original question in this series was: "${originalBaseQuestionTextForLLMPrompt}"\n`;
                llmUserPrompt += `The previous follow-up question asked was: "${answeredQuestionObject.text}"\n`;
            } else {
                llmUserPrompt += `The question asked was: "${originalBaseQuestionTextForLLMPrompt}"\n`; // Use originalBaseQuestionTextForLLMPrompt here too for consistency
            }
            llmUserPrompt += `Participant's Insufficient Answer: "${response}"\n`;
            llmUserPrompt += `Reason the answer was insufficient (feedback from evaluation): "${evaluationResult.feedback}"\n\n`;
            llmUserPrompt += `Based on this, please generate a single, brief, targeted follow-up question to help the participant provide the missing information or elaborate appropriately. Do not be conversational, just provide the question text.`;

            const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
                { role: 'system', content: llmSystemPrompt },
                { role: 'user', content: llmUserPrompt },
            ];

            let llmGeneratedFollowUpText = '';
            try {
                llmGeneratedFollowUpText = await this.llmService.generateChatCompletion(messages, undefined, 0.5); // temp 0.5 for focused Qs
                llmGeneratedFollowUpText = llmGeneratedFollowUpText.replace(/^"|"$/g, '').trim(); // Clean quotes and trim
            } catch (llmError) {
                this.logger.error(`LLM call for follow-up generation failed: ${llmError instanceof Error ? llmError.message : String(llmError)}`);
            }

            if (!llmGeneratedFollowUpText) {
                this.logger.warn('LLM failed to generate follow-up question text or returned empty. Falling back to generic prompt.');
                // Fallback incorporates evaluation feedback if available
                const fallbackDetail = evaluationResult.feedback ? `Specifically, consider: ${evaluationResult.feedback}` : 'Please provide more detail.';
                llmGeneratedFollowUpText = `Please elaborate further on your previous answer regarding "${answeredQuestionObject.text.substring(0,50)}...". ${fallbackDetail}`;
            }
            
            const newFollowUpOrder = parseFloat((baseQuestionOrderForFollowUp + (currentFollowUpCountForBase + 1) / 100).toFixed(4));
            
            const generatedFollowUp: Question = {
              id: uuidv4(),
              text: llmGeneratedFollowUpText,
              type: answeredQuestionObject.type,
              intent: 'FOLLOW_UP',
              sectionId: answeredQuestionObject.sectionId,
              parentQuestionId: baseQuestionIdForFollowUp,
              generatedForParticipantId: participant.id,
              order: newFollowUpOrder,
              goal: `To clarify or expand upon the previous insufficient answer related to: ${originalBaseQuestionTextForLLMPrompt?.substring(0,70)}...`, // Add a goal for the FU
            };
            newFollowUpQuestionForSessionPersistence = generatedFollowUp;

            participantQueue.questions.splice(participantQueue.currentQuestionIndex + 1, 0, newFollowUpQuestionForSessionPersistence);
            participantQueue.followUpCounts[baseQuestionIdForFollowUp]++;
            participantQueue.currentQuestionIndex++; 
            nextQuestion = newFollowUpQuestionForSessionPersistence;
            this.logger.log(`Generated LLM-based FU Q:${nextQuestion.id} ("${nextQuestion.text.substring(0,50)}...") for P:${participant.id}.`);
          } else {
            this.logger.log(`Max follow-ups (${this.MAX_FOLLOW_UPS}) reached for base Q:${baseQuestionIdForFollowUp}. Advancing to next base question or completing participant.`);
            
            const ultimateBaseQuestionId = (answeredQuestionObject.intent === 'FOLLOW_UP' && answeredQuestionObject.parentQuestionId) 
                                            ? answeredQuestionObject.parentQuestionId 
                                            : answeredQuestionObject.id;

            const nextBaseQuestionObject = this.findNextBaseQuestionInQueue(participantQueue, ultimateBaseQuestionId);

            if (nextBaseQuestionObject) {
              const nextBaseQuestionIndexInQueue = participantQueue.questions.findIndex(
                q => q.id === nextBaseQuestionObject.id && q.intent === 'BASE'
              );
              if (nextBaseQuestionIndexInQueue !== -1) {
                participantQueue.currentQuestionIndex = nextBaseQuestionIndexInQueue;
                nextQuestion = participantQueue.questions[nextBaseQuestionIndexInQueue];
                this.logger.log(`Max follow-ups for ${ultimateBaseQuestionId} reached. Advancing to next base question Q:${nextQuestion.id}`);
              } else {
                this.logger.error(`Could not find the next base question (ID: ${nextBaseQuestionObject.id}) in the current P-Queue for P:${participantId}, though it was found in base order. Completing participant as a fallback.`);
                participantCompletedSession = true;
              }
            } else {
              this.logger.log(`Max follow-ups for ${ultimateBaseQuestionId} reached, and no more base questions in queue for P:${participantId}. Completing participant.`);
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
             if (!sectionToUpdate.questions.find(q => q.id === newFollowUpQuestionForSessionPersistence!.id)) {
                sectionToUpdate.questions.push(newFollowUpQuestionForSessionPersistence);
                sectionToUpdate.questions.sort((a,b) => a.order - b.order);
                this.logger.log(`Added generated FU Q:${newFollowUpQuestionForSessionPersistence.id} to section ${sectionToUpdate.id} for persistence.`);
             } else {
                this.logger.log(`FU Q:${newFollowUpQuestionForSessionPersistence.id} already present in section ${sectionToUpdate.id}. Not re-adding.`);
             }
          } else {
            this.logger.error(`Could not find section ${newFollowUpQuestionForSessionPersistence.sectionId} to add FU question.`);
          }
        }
        
        if (participantCompletedSession && participant) {
          participant.status = 'COMPLETED';
          participant.completedAt = new Date();
          participant.currentQuestion = '';
          participant.currentSection = '';
          this.logger.log(`P:${participant.id} in S:${sessionId} has completed all questions.`);
        } else if (nextQuestion && participant) {
          participant.currentQuestion = nextQuestion.id;
          participant.currentSection = nextQuestion.sectionId;
          participant.status = 'ACTIVE';
        }
        
        if (session) {
            session.version +=1;
            await this.persistSession(session);
        }
        await this.setParticipantQueue(sessionId, participantId, participantQueue);

        if (participant) {
            this.sessionEventsService.emitParticipantStatus(sessionId, participant.id, participant.status, participant.currentQuestion, participant.currentSection);
        }

        if (participantCompletedSession && session && participant) {
          this.logger.log(`P:${participant.id} COMPLETED. Checking if session is complete.`);
          const activeOrPendingParticipants = session.participants.filter(p => p.status !== 'COMPLETED' && p.status !== 'INACTIVE');

          if (activeOrPendingParticipants.length === 0 && session.participants.some(p => p.status === 'COMPLETED')) { 
            this.logger.log(`All active/pending participants in S:${sessionId} have completed. Completing session.`);
            await this.sessionService.completeSession(sessionId); 
          }
        } else if (nextQuestion && participant) {
          this.logger.log(`Next question for P:${participant.id} is Q:${nextQuestion.id}. Emitting QuestionReady.`);
          this.sessionEventsService.emitQuestionReady(sessionId, participant.id, nextQuestion);
        } else if (participant && !participantCompletedSession && !nextQuestion) {
          this.logger.error(`P:${participant.id} is not completed, but no next question was determined. Current status: ${participant.status}. This may indicate an issue.`);
          this.sessionEventsService.emitParticipantStatus(sessionId, participant.id, participant.status, participant.currentQuestion, participant.currentSection);
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
            if (participant) {
              // this.sessionEventsService.emitErrorToParticipant(sessionId, participantId, 'Failed to process your answer due to a server conflict. Please try again or contact support.');
              this.logger.error(`TODO: Emit actual error to P:${participantId} - Failed to process answer due to server conflict.`);
            }
            return;
          }
        } else {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Unexpected error processing answer for S:${sessionId}, P:${participantId}, Q:${answeredQuestionId} (Attempt ${retries + 1}): ${errorMessage}`,
            error instanceof Error ? error.stack : undefined
          );
          if (participant) {
            // this.sessionEventsService.emitErrorToParticipant(sessionId, participantId, 'An unexpected error occurred while processing your answer. Please try again or contact support.');
            this.logger.error(`TODO: Emit actual error to P:${participantId} - Unexpected error occurred.`);
          }
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
      // if (participantId) this.sessionEventsService.emitErrorToParticipant(sessionId, participantId, 'Session not found.');
      return null;
    }

    const participant = session.participants.find(p => p.id === participantId);
    if (!participant) {
      this.logger.error(`P:${participantId} not found in S:${sessionId}. Cannot get next question.`);
      return null;
    }
    
    if (participant.status === 'COMPLETED') {
      this.logger.log(`P:${participantId} is already COMPLETED. No next question.`);
      this.sessionEventsService.emitParticipantStatus(sessionId, participantId, 'COMPLETED', '', '');
      return null;
    }

    let participantQueue = await this.getParticipantQueue(sessionId, participantId);
    if (!participantQueue || participantQueue.questions.length === 0 || participantQueue.currentQuestionIndex >= participantQueue.questions.length) {
      this.logger.log(`No existing/valid queue for P:${participantId}, or participant is at end of initialized queue. Initializing/Re-initializing...`);
      participantQueue = await this.initializeParticipantQueue(session, participant);
      if (!participantQueue || participantQueue.questions.length === 0) { 
        this.logger.error(`Failed to initialize queue or queue is empty for P:${participantId}. Cannot determine next question.`);
        this.sessionEventsService.emitParticipantStatus(sessionId, participant.id, participant.status, participant.currentQuestion, participant.currentSection); 
        return null;
      }
    }
    
    const nextQuestion = participantQueue.questions[participantQueue.currentQuestionIndex];
    
    if (nextQuestion && participant) { // Ensure participant exists
        this.logger.log(`Next question for P:${participantId} is Q:${nextQuestion.id} from queue index ${participantQueue.currentQuestionIndex}.`);
        
        participant.currentQuestion = nextQuestion.id;
        participant.currentSection = nextQuestion.sectionId;
        // participant.status = 'ACTIVE'; // Status should be set by processParticipantAnswer or session activation

        this.sessionEventsService.emitQuestionReady(sessionId, participantId, nextQuestion);
        return nextQuestion;
    } else {
        this.logger.warn(`P:${participantId} in S:${sessionId}: No next question found in queue at index ${participantQueue?.currentQuestionIndex}, but status is not COMPLETED. This might indicate end of queue.`);
        if(participant && participantQueue && participantQueue.currentQuestionIndex >= participantQueue.questions.length ){
            participant.status = 'COMPLETED';
            participant.currentQuestion = ''; 
            participant.currentSection = '';
            participant.completedAt = new Date();
            try {
              if (session) {
                session.version += 1;
                await this.persistSession(session); 
              }
              await this.setParticipantQueue(sessionId, participantId, participantQueue); 
              this.sessionEventsService.emitParticipantStatus(sessionId, participant.id, 'COMPLETED', '', '');
              this.logger.log(`P:${participantId} marked COMPLETED in getNextQuestion as end of queue was reached and no next Q object.`);
              
              if (session && session.participants.filter(p => p.status !== 'COMPLETED' && p.status !== 'INACTIVE').length === 0 && session.participants.some(p=>p.status === 'COMPLETED')) {
                this.logger.log(`All active/pending participants in S:${sessionId} have completed after P:${participantId} finished. Completing session.`);
                await this.sessionService.completeSession(sessionId);
              }
            } catch (error) {
              this.logger.error(`Error persisting COMPLETED status for P:${participantId} in getNextQuestion: ${error}`);
            }
        } else if (participant) { 
             this.sessionEventsService.emitParticipantStatus(sessionId, participant.id, participant.status, participant.currentQuestion, participant.currentSection);
        }
        return null;
    }
  }

  // Renamed from findQuestionById to avoid conflict if another service uses it more generically
  // This one is specific to finding within the session structure passed to orchestrator methods.
  private findQuestionById(session: Session, questionId: string): Question | undefined {
    if (!questionId) return undefined;
    for (const section of session.sections) {
      const question = section.questions.find(q => q.id === questionId);
      if (question) return question;
    }
    this.logger.warn(`(Legacy find) Question with ID ${questionId} not found in any section of session ${session.id}`);
    return undefined;
  }

  // Helper to find a question by ID from the session object (used for context)
  private findQuestionInSessionById(session: Session, questionId: string): Question | undefined {
    for (const section of session.sections) {
      const found = section.questions.find(q => q.id === questionId);
      if (found) return found;
    }
    // this.logger.warn(`(Orchestrator specific find) Question with ID ${questionId} not found in any section of session ${session.id}`);
    return undefined;
  }
}
