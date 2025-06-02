import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import {
  Session,
  Participant,
  Question,
  // ParticipantStatus, // Not directly used here, but indirectly via participant.status
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

// Ensure ProcessAnswerContext interface is defined
interface ProcessAnswerContext {
  session: Session;
  participant: Participant;
  participantQueue: ParticipantQueueCache;
  answeredQuestionObject: Question;
}

interface FormattedSimilarAnswerContext {
  questionText: string;
  responseText: string | number;
  participantRole: string;
  similarityScore: number;
}

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);
  private readonly MAX_FOLLOW_UPS = 3;
  private readonly MAX_PROCESS_ANSWER_RETRIES = 10;

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

  private findQuestionInSessionById(session: Session, questionId: string): Question | undefined {
    for (const section of session.sections) {
      const found = section.questions.find(q => q.id === questionId);
      if (found) return found;
    }
    return undefined;
  }

  private async _initializeAndValidateRequest(
    sessionId: string, 
    participantId: string, 
    answeredQuestionId: string,
    currentAttempt: number,
    existingParticipantQueue?: ParticipantQueueCache | null 
  ): Promise<ProcessAnswerContext | null> {
    const session = await this.getSession(sessionId);
    if (!session) {
      this.logger.error(`S:${sessionId} not found (Attempt ${currentAttempt}). Cannot process answer.`);
      // TODO: this.sessionEventsService.emitErrorToParticipant(sessionId, participantId, 'SESSION_NOT_FOUND', 'Session could not be found.');
      return null;
    }

    const participant = session.participants.find(p => p.id === participantId);
    if (!participant) {
      this.logger.error(`P:${participantId} not found in S:${sessionId} (Attempt ${currentAttempt}). Cannot process answer.`);
      // TODO: this.sessionEventsService.emitErrorToParticipant(sessionId, participantId, 'PARTICIPANT_NOT_FOUND', 'Participant could not be found in this session.');
      return null;
    }

    let participantQueue = existingParticipantQueue;
    if (!participantQueue) {
        participantQueue = await this.getParticipantQueue(sessionId, participantId);
        if (!participantQueue) {
            this.logger.log(`No existing queue for P:${participantId} (Attempt ${currentAttempt}). Initializing...`);
            participantQueue = await this.initializeParticipantQueue(session, participant);
            if (!participantQueue) {
            this.logger.error(`Failed to initialize queue for P:${participantId} (Attempt ${currentAttempt}). Cannot process answer.`);
            // TODO: this.sessionEventsService.emitErrorToParticipant(sessionId, participantId, 'QUEUE_INIT_FAILED', 'Could not initialize question queue.');
            return null;
            }
        }
    }
    
    const answeredQuestionObject = participantQueue.questions[participantQueue.currentQuestionIndex];

    if (participant.status === 'COMPLETED') {
      this.logger.warn(`P:${participantId} in S:${sessionId} is COMPLETED. Ignoring answer.`);
      if (answeredQuestionObject) { // If they are completed but somehow an answer comes through, send their "current" (last) question
        this.sessionEventsService.emitQuestionReady(sessionId, participant.id, answeredQuestionObject);
      } else { // Or just affirm their completed status
        this.sessionEventsService.emitParticipantStatus(sessionId, participant.id, 'COMPLETED');
      }
      return null; 
    }
    
    if (!answeredQuestionObject || answeredQuestionObject.id !== answeredQuestionId) {
      this.logger.warn(
        `P:${participantId} answered Q:${answeredQuestionId}, but current in queue is Q:${answeredQuestionObject?.id}. Re-sending current from queue.`,
      );
      if (answeredQuestionObject) {
        this.sessionEventsService.emitQuestionReady(sessionId, participant.id, answeredQuestionObject);
      } else {
        // This is an odd state - no current question but not completed.
        this.logger.error(`P:${participantId} has no current question in queue but status is ${participant.status}. Emitting current status.`);
        this.sessionEventsService.emitParticipantStatus(sessionId, participant.id, participant.status, participant.currentQuestion, participant.currentSection);
      }
      return null; 
    }
    return { session, participant, participantQueue, answeredQuestionObject };
  }

  private _processSufficientAnswer(
    participantQueue: ParticipantQueueCache
  ): { nextQuestion: Question | null; participantCompletedSession: boolean } {
    this.logger.log(`Answer sufficient. Advancing in P-Queue.`);
    participantQueue.currentQuestionIndex++;
    let nextQuestion: Question | null = null;
    let participantCompletedSession = false;

    if (participantQueue.currentQuestionIndex < participantQueue.questions.length) {
      nextQuestion = participantQueue.questions[participantQueue.currentQuestionIndex];
    } else {
      participantCompletedSession = true;
    }
    return { nextQuestion, participantCompletedSession };
  }

  private async _generateAndQueueFollowUp(
    session: Session,
    participant: Participant,
    answeredQuestionObject: Question,
    baseQuestionIdForFollowUp: string,
    baseQuestionOrderForFollowUp: number,
    originalBaseQuestionTextForLLMPrompt: string,
    response: string | number, 
    evaluationResultAnalyticalFeedback: string | undefined,
    participantQueue: ParticipantQueueCache,
    sessionTitle: string,
    sessionDescription: string | undefined,
    participantAssignedRole: string,
    similarAnswersContext: FormattedSimilarAnswerContext[] | null,
    suggestedFollowUpType: 'TEXT' | 'YES_NO' | 'RATING_1_5'
  ): Promise<{ nextQuestion: Question | null; newFollowUpQuestionForSessionPersistence: Question | null }> {
    this.logger.log(`Attempting to generate LLM follow-up for P:${participant.id} (Role: ${participantAssignedRole}), BaseQ:${baseQuestionIdForFollowUp} in Session: "${sessionTitle}". Instructed type: ${suggestedFollowUpType}. (Follow-up attempt ${ (participantQueue.followUpCounts[baseQuestionIdForFollowUp] || 0) + 1})`);

    // Determine the required prefix based on the suggestedFollowUpType
    let requiredPrefix = '[TEXT]';
    if (suggestedFollowUpType === 'YES_NO') {
      requiredPrefix = '[YES_NO]';
    } else if (suggestedFollowUpType === 'RATING_1_5') {
      requiredPrefix = '[RATING_1_5]';
    }

    const llmSystemPrompt = `You are an expert session facilitator and critical thinker. Your goal is to generate a *single, concise, focused, and insightful* follow-up question of a specific type when a participant's answer is insufficient.

The required type for this follow-up question is: ${suggestedFollowUpType}.
Your response *must* start with the prefix \`${requiredPrefix}\` followed by the question itself.

For example, if the required type is RATING_1_5, your question should look like: "[RATING_1_5] On a scale of 1 to 5, how clear was the objective?"
If the required type is YES_NO, your question should look like: "[YES_NO] Was this the primary challenge?"
If the required type is TEXT, your question should look like: "[TEXT] Can you elaborate on the main obstacles?"

Use the provided context and analytical feedback to craft a high-quality question of the specified type (${suggestedFollowUpType}).

General Guidelines for Quality Follow-up Questions:
- Aim to uncover *underlying reasons, motivations, or assumptions*.
- Explore the *impact, consequences, or significance*.
- Encourage *reflection on alternatives or different perspectives*.
- Identify *key learnings or deeper insights*.
- If the answer is vague, ask for *clarification on a specific part* of their statement rather than general elaboration.
- Avoid overly broad, multi-part, or leading questions. Keep it focused on one key area.

The question should be direct, easy to understand, and tailored to the context provided.
Session Title: '${sessionTitle}'
Session Goal: ${sessionDescription || 'Not specified'}
Participant Role: '${participantAssignedRole}'`;

    let llmUserPrompt = `The participant just answered a question, but their answer was deemed insufficient. You must generate a follow-up question of type: ${suggestedFollowUpType}.\n`;

    if (answeredQuestionObject.intent === 'FOLLOW_UP') {
        llmUserPrompt += `Context: The participant is responding to a series of questions. The original question in this series was: "${originalBaseQuestionTextForLLMPrompt}"\n`;
        llmUserPrompt += `The previous follow-up question asked was: "${answeredQuestionObject.text}"\n`;
    } else {
        llmUserPrompt += `The question asked was: "${originalBaseQuestionTextForLLMPrompt}"\n`;
    }

    llmUserPrompt += `Participant's Insufficient Answer: "${typeof response === 'string' ? response : JSON.stringify(response)}"\n`;
    llmUserPrompt += `Reason for Insufficiency (Feedback from evaluation): "${evaluationResultAnalyticalFeedback || 'No specific feedback provided, but the answer needs more depth.'}"\n\n`;

    llmUserPrompt += `Consider the following approaches for your follow-up question:
`;
    llmUserPrompt += `1.  **Clarification:** If a specific part of the answer is ambiguous, ask for clarification on *that part*. (e.g., "When you mentioned 'X', what did you specifically mean by that?")\n`;
    llmUserPrompt += `2.  **Probing for Reasons/Motivations:** Ask *why* they hold that view or made that statement. (e.g., "What led you to that conclusion about 'Y'?")\n`;
    llmUserPrompt += `3.  **Exploring Impact/Consequences:** Ask about the effects or results of what they described. (e.g., "What was the primary impact of 'Z' on the outcome?")\n`;
    llmUserPrompt += `4.  **Seeking Elaboration on Depth/Insight:** If the answer is superficial, ask for a deeper dive into a key aspect. (e.g., "Could you elaborate on the most critical factor in 'A'?")\n`;
    llmUserPrompt += `5.  **Considering Alternatives/Trade-offs:** If appropriate, ask about other options or why the stated one was chosen. (e.g., "Were other approaches like 'B' considered, and if so, why was this one preferred?")\n`;
    llmUserPrompt += `\n`;

    if (similarAnswersContext && similarAnswersContext.length > 0) {
      llmUserPrompt += `For additional context, here are some relevant past answers from other participants on similar topics (higher score means more similar):\n`;
      for (const ctx of similarAnswersContext) {
        const questionPreview = ctx.questionText.length > 50 ? `${ctx.questionText.substring(0, 47)}...` : ctx.questionText;
        const answerPreview = String(ctx.responseText).length > 70 ? `${String(ctx.responseText).substring(0, 67)}...` : String(ctx.responseText);
        llmUserPrompt += `- Regarding a question like "${questionPreview}", a participant (Role: ${ctx.participantRole}) answered: "${answerPreview}" (Similarity: ${ctx.similarityScore})\n`;
      }
      llmUserPrompt += 'Please consider this context when formulating your follow-up question to potentially highlight gaps, common themes, or ask for differentiation from these other answers.\n';
    }

    llmUserPrompt += `\nBased on all the above, and focusing on the analytical feedback provided, generate a *single, concise, focused, and insightful* follow-up question for the participant. Your response *must* start with the prefix \`${requiredPrefix}\` (as the required question type is ${suggestedFollowUpType}).`;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: llmSystemPrompt },
        { role: 'user', content: llmUserPrompt },
    ];

    this.logger.debug(`Follow-up Generation LLM Messages >>>>>>>>>>>>>>\nSystem Prompt:\n${llmSystemPrompt}\n\nUser Prompt:\n${llmUserPrompt}`);

    let llmGeneratedFollowUpText = '';
    try {
        llmGeneratedFollowUpText = await this.llmService.generateChatCompletion(messages, undefined, 0.5);
        // llmGeneratedFollowUpText = llmGeneratedFollowUpText.replace(/^"|"$/g, '').trim(); // Trim quotes after parsing prefix
    } catch (llmError) {
        this.logger.error(`LLM call for follow-up generation failed: ${llmError instanceof Error ? llmError.message : String(llmError)}`);
    }

    if (!llmGeneratedFollowUpText.trim()) {
        this.logger.warn('LLM failed to generate follow-up question text or returned empty. Falling back to generic prompt.');
        const fallbackDetail = evaluationResultAnalyticalFeedback ? `Specifically, consider: ${evaluationResultAnalyticalFeedback}` : 'Please provide more detail.';
        // Fallback respects the suggestedFollowUpType for its prefix
        llmGeneratedFollowUpText = `${requiredPrefix} Please elaborate further on your previous answer regarding "${answeredQuestionObject.text.substring(0,50)}...". ${fallbackDetail}`;
    }

    console.log('llmGeneratedFollowUpText >>>>>>>>>>>>>>>>>>>>> ', llmGeneratedFollowUpText);
    
    let questionText = '';
    // Type assertion for AnswerDataType. You might need to adjust 'string', 'boolean', 'number'
    // if AnswerDataType is an enum or has different literal values from the 'type' property of Question.
    let questionAnswerDataType: any = 'string'; // Defaulting to string, will be updated based on prefix.
    let displayHint: 'TEXT' | 'YES_NO' | 'RATING_1_5' = 'TEXT';
    let options: string[] | undefined = undefined;

    if (llmGeneratedFollowUpText.startsWith('[TEXT] ')) {
        displayHint = 'TEXT';
        questionText = llmGeneratedFollowUpText.substring('[TEXT] '.length).trim();
        questionAnswerDataType = 'string'; // Corresponds to an open text answer
    } else if (llmGeneratedFollowUpText.startsWith('[YES_NO] ')) {
        displayHint = 'YES_NO';
        questionText = llmGeneratedFollowUpText.substring('[YES_NO] '.length).trim();
        questionAnswerDataType = 'boolean'; // Corresponds to a boolean answer
        options = ['Yes', 'No'];
    } else if (llmGeneratedFollowUpText.startsWith('[RATING_1_5] ')) {
        displayHint = 'RATING_1_5';
        questionText = llmGeneratedFollowUpText.substring('[RATING_1_5] '.length).trim();
        questionAnswerDataType = 'number'; // Corresponds to a numerical answer
        options = ['1', '2', '3', '4', '5'];
    } else {
        this.logger.warn(`LLM response "${llmGeneratedFollowUpText}" missing expected prefix or prefix is not at the very beginning. Defaulting to TEXT type and using full response as question.`);
        questionText = llmGeneratedFollowUpText.replace(/^"|"$/g, '').trim(); // Clean potential surrounding quotes
        questionAnswerDataType = 'string'; 
        displayHint = 'TEXT';
    }

    if (!questionText) { // If after stripping prefix, question is empty
        this.logger.warn('LLM generated an empty question after stripping prefix. Using fallback text.');
        const fallbackDetail = evaluationResultAnalyticalFeedback ? `Specifically, consider: ${evaluationResultAnalyticalFeedback}` : 'Please provide more detail.';
        questionText = `Please elaborate further on your previous answer regarding "${answeredQuestionObject.text.substring(0,50)}...". ${fallbackDetail}`;
        displayHint = 'TEXT';
        questionAnswerDataType = 'string';
    }
    
    const currentFollowUpCountForBase = participantQueue.followUpCounts[baseQuestionIdForFollowUp] || 0;
    const newFollowUpOrder = parseFloat((baseQuestionOrderForFollowUp + (currentFollowUpCountForBase + 1) / 100).toFixed(4));
    
    const generatedFollowUp: Question = {
      id: uuidv4(),
      text: questionText,
      type: questionAnswerDataType, // Set the answer data type based on parsed prefix
      // displayHint and options are new properties.
      // You will need to update the Question type definition in @rohit-constellation/types
      // For now, we cast to allow these properties.
      displayHint: displayHint,
      options: options,
      intent: 'FOLLOW_UP',
      sectionId: answeredQuestionObject.sectionId,
      parentQuestionId: baseQuestionIdForFollowUp,
      generatedForParticipantId: participant.id,
      order: newFollowUpOrder,
      goal: `To clarify or expand upon the previous insufficient answer related to: ${originalBaseQuestionTextForLLMPrompt?.substring(0,70)}...`,
    } as Question & { displayHint?: 'TEXT' | 'YES_NO' | 'RATING_1_5'; options?: string[] };

    participantQueue.questions.splice(participantQueue.currentQuestionIndex + 1, 0, generatedFollowUp);
    participantQueue.followUpCounts[baseQuestionIdForFollowUp]++;
    participantQueue.currentQuestionIndex++; 
    this.logger.log(`Generated LLM-based FU Q:${generatedFollowUp.id} ("${generatedFollowUp.text.substring(0,50)}...") for P:${participant.id}. It's now the current question.`);

    return { nextQuestion: generatedFollowUp, newFollowUpQuestionForSessionPersistence: generatedFollowUp };
  }

  private _handleMaxFollowUpsReached(
    participantQueue: ParticipantQueueCache,
    answeredQuestionObject: Question, // This is the question whose answer triggered this (could be base or FU)
    participantId: string // For logging
  ): { nextQuestion: Question | null; participantCompletedSession: boolean } {
    // Determine the ultimate base question ID for this line of questioning
    const ultimateBaseQuestionId = (answeredQuestionObject.intent === 'FOLLOW_UP' && answeredQuestionObject.parentQuestionId) 
                                    ? answeredQuestionObject.parentQuestionId 
                                    : answeredQuestionObject.id;
    this.logger.log(`Max follow-ups (${this.MAX_FOLLOW_UPS}) reached for base Q:${ultimateBaseQuestionId}. Advancing to next base question or completing P:${participantId}.`);

    const nextBaseQuestionObject = this.findNextBaseQuestionInQueue(participantQueue, ultimateBaseQuestionId);
    let nextQuestion: Question | null = null;
    let participantCompletedSession = false;

    if (nextBaseQuestionObject) {
      // Find the index of this next base question in the potentially modified live queue
      const nextBaseQuestionIndexInQueue = participantQueue.questions.findIndex(
        q => q.id === nextBaseQuestionObject.id && q.intent === 'BASE'
      );
      if (nextBaseQuestionIndexInQueue !== -1) {
        participantQueue.currentQuestionIndex = nextBaseQuestionIndexInQueue;
        nextQuestion = participantQueue.questions[nextBaseQuestionIndexInQueue];
        this.logger.log(`Max follow-ups for ${ultimateBaseQuestionId} reached. Advancing to next base question Q:${nextQuestion.id} for P:${participantId}`);
      } else {
        // Should ideally not happen if findNextBaseQuestionInQueue found one based on base order
        this.logger.error(`Could not find the next base question (ID: ${nextBaseQuestionObject.id}) in the current P-Queue for P:${participantId}, though it was found in base order. Completing P as a fallback.`);
        participantCompletedSession = true;
      }
    } else {
      this.logger.log(`Max follow-ups for ${ultimateBaseQuestionId} reached, and no more base questions in queue for P:${participantId}. Completing participant.`);
      participantCompletedSession = true;
    }
    return { nextQuestion, participantCompletedSession };
  }

  private async _processInsufficientAnswer(
    session: Session,
    participant: Participant,
    answeredQuestionObject: Question,
    response: string | number, 
    evaluationResult: { isSufficient: boolean; participantFeedback?: string; analyticalFeedback?: string; score?: number; suggestedFollowUpType?: 'TEXT' | 'YES_NO' | 'RATING_1_5' },
    participantQueue: ParticipantQueueCache,
    similarAnswersContext: FormattedSimilarAnswerContext[] | null
  ): Promise<{ nextQuestion: Question | null; participantCompletedSession: boolean; newFollowUpQuestionForSessionPersistence: Question | null }> {
    this.logger.log(`Answer to Q:${answeredQuestionObject.id} by P:${participant.id} was insufficient. AnalyticalFeedback: "${evaluationResult.analyticalFeedback || evaluationResult.participantFeedback || 'N/A'}". Suggested FU Type: ${evaluationResult.suggestedFollowUpType || 'Defaulting to TEXT'}. Handling follow-up. Similar contexts: ${similarAnswersContext ? similarAnswersContext.length : 0}`);
    
    let baseQuestionIdForFollowUp: string;
    let baseQuestionOrderForFollowUp: number;
    let originalBaseQuestionTextForLLMPrompt: string | undefined = answeredQuestionObject.text;

    if (answeredQuestionObject.intent === 'FOLLOW_UP' && answeredQuestionObject.parentQuestionId) {
      baseQuestionIdForFollowUp = answeredQuestionObject.parentQuestionId;
      const originalBaseQFromSession = this.findQuestionInSessionById(session, baseQuestionIdForFollowUp);
      if (originalBaseQFromSession) {
        originalBaseQuestionTextForLLMPrompt = originalBaseQFromSession.text;
        baseQuestionOrderForFollowUp = originalBaseQFromSession.order;
      } else {
        this.logger.warn(`Could not find original base question ${baseQuestionIdForFollowUp} in session for follow-up context. Using defaults.`);
        originalBaseQuestionTextForLLMPrompt = 'the original question'; 
        baseQuestionOrderForFollowUp = answeredQuestionObject.order - 0.01; 
      }
    } else { 
      baseQuestionIdForFollowUp = answeredQuestionObject.id;
      baseQuestionOrderForFollowUp = answeredQuestionObject.order;
      originalBaseQuestionTextForLLMPrompt = answeredQuestionObject.text; 
    }
    
    participantQueue.followUpCounts[baseQuestionIdForFollowUp] = participantQueue.followUpCounts[baseQuestionIdForFollowUp] || 0;
    const currentFollowUpCountForBase = participantQueue.followUpCounts[baseQuestionIdForFollowUp];

    if (currentFollowUpCountForBase < this.MAX_FOLLOW_UPS) {
      // Pass similarAnswersContext to _generateAndQueueFollowUp
      const followUpResult = await this._generateAndQueueFollowUp(
        session, 
        participant, 
        answeredQuestionObject, 
        baseQuestionIdForFollowUp, 
        baseQuestionOrderForFollowUp, 
        originalBaseQuestionTextForLLMPrompt!, 
        response, 
        evaluationResult.analyticalFeedback,
        participantQueue,
        session.title,
        session.description,
        participant.role,
        similarAnswersContext, // <-- Pass the context here
        evaluationResult.suggestedFollowUpType || 'TEXT' // Pass suggested type, default to TEXT if undefined
      );
      return { ...followUpResult, participantCompletedSession: false };
    } else {
      const { nextQuestion, participantCompletedSession } = this._handleMaxFollowUpsReached(
        participantQueue, 
        answeredQuestionObject, 
        participant.id
      );
      return { nextQuestion, participantCompletedSession, newFollowUpQuestionForSessionPersistence: null };
    }
  }

  private async _runSimilaritySearch(
    answerIdToExclude: string, 
    targetEmbedding: string | null, 
    sessionId: string,
    currentParticipantId: string, 
    sessionForContextLookup: Session 
  ): Promise<FormattedSimilarAnswerContext[] | null> {
    if (!targetEmbedding || targetEmbedding === '[]' || targetEmbedding.startsWith('[0,0,0')) { 
        this.logger.log(`Target embedding for A:${answerIdToExclude} is invalid, zero, or not provided. Skipping similarity search.`);
        return null;
    }
    try {
      this.logger.log(`Performing similarity search for A:${answerIdToExclude}, excluding P:${currentParticipantId}.`);
      const similarDbAnswers = await this.answerService.findSimilarAnswers(
        targetEmbedding,
        5, 
        sessionId,
        answerIdToExclude,      
        currentParticipantId    
      );

      if (!similarDbAnswers || similarDbAnswers.length === 0) {
        this.logger.log(`No similar answers found for A:${answerIdToExclude} (excluding self and P:${currentParticipantId}).`);
        return null;
      }

      this.logger.log(`Found ${similarDbAnswers.length} raw similar answers to A:${answerIdToExclude}. Formatting context...`);
      
      const formattedContext: FormattedSimilarAnswerContext[] = [];

      for (const similarAnswer of similarDbAnswers) {
        const question = this.findQuestionInSessionById(sessionForContextLookup, similarAnswer.questionId);
        if (!question) {
          this.logger.warn(`Could not find question ${similarAnswer.questionId} in session ${sessionForContextLookup.id} for similar answer ${similarAnswer.id}. Skipping this context.`);
          continue;
        }

        const p = sessionForContextLookup.participants.find(par => par.id === similarAnswer.participantId);
        if (!p) {
          this.logger.warn(`Could not find participant ${similarAnswer.participantId} in session ${sessionForContextLookup.id} for similar answer ${similarAnswer.id}. Skipping this context.`);
          continue;
        }
        
        const score = 1 / (1 + Math.max(0, similarAnswer.distance));

        formattedContext.push({
          questionText: question.text,
          responseText: similarAnswer.response,
          participantRole: p.role,
          similarityScore: parseFloat(score.toFixed(4)) 
        });
      }
      
      if (formattedContext.length > 0) {
        this.logger.log(`Formatted ${formattedContext.length} similar answer contexts for A:${answerIdToExclude}.`);
        return formattedContext;
      } else {
        this.logger.log(`No suitable context could be formatted from similar answers for A:${answerIdToExclude}.`);
        return null;
      }

    } catch (simSearchError) {
      this.logger.error(`Error during similarity search processing for A:${answerIdToExclude}: ${simSearchError instanceof Error ? simSearchError.message : String(simSearchError)}`);
      return null; 
    }
  }

  private async _updateSessionEntities(
    session: Session,
    participant: Participant,
    participantQueue: ParticipantQueueCache,
    nextQuestion: Question | null,
    participantCompletedSession: boolean,
    newFollowUpQuestionForSessionPersistence: Question | null
  ): Promise<void> {
    // 1. Add new follow-up question to session object if one was generated
    if (newFollowUpQuestionForSessionPersistence) {
      const sectionToUpdate = session.sections.find(s => s.id === newFollowUpQuestionForSessionPersistence!.sectionId);
      if (sectionToUpdate) {
         // Ensure question is not already in the section's questions array (idempotency)
         if (!sectionToUpdate.questions.find(q => q.id === newFollowUpQuestionForSessionPersistence!.id)) {
            sectionToUpdate.questions.push(newFollowUpQuestionForSessionPersistence);
            sectionToUpdate.questions.sort((a,b) => a.order - b.order); // Keep questions sorted
            this.logger.log(`Added generated FU Q:${newFollowUpQuestionForSessionPersistence.id} to section ${sectionToUpdate.id} for session persistence.`);
         } else {
            this.logger.log(`FU Q:${newFollowUpQuestionForSessionPersistence.id} already present in section ${sectionToUpdate.id}. Not re-adding for session persistence.`);
         }
      } else {
        this.logger.error(`Could not find section ${newFollowUpQuestionForSessionPersistence.sectionId} to add FU question. Session will be persisted without it.`);
      }
    }
    
    // 2. Update participant's status, currentQuestion, currentSection, and completedAt
    if (participantCompletedSession) {
      participant.status = 'COMPLETED';
      participant.completedAt = new Date();
      participant.currentQuestion = ''; // Clear current question
      participant.currentSection = ''; // Clear current section
      this.logger.log(`P:${participant.id} in S:${session.id} has completed all questions.`);
    } else if (nextQuestion) {
      participant.currentQuestion = nextQuestion.id;
      participant.currentSection = nextQuestion.sectionId;
      participant.status = 'ACTIVE'; // Ensure status is active if there's a next question
    }
    // If no nextQuestion and not participantCompletedSession, status is handled by initial emit or prior logic.
    
    // 3. Persist session (with updated questions and participant states)
    session.version +=1; // Increment version for optimistic locking
    await this.persistSession(session); // This saves the session and its embedded entities like participants
    
    // 4. Persist participant's queue state (index, new FUs) to cache
    await this.setParticipantQueue(session.id, participant.id, participantQueue);
    this.logger.log(`Updated entities for P:${participant.id} in S:${session.id}. Session version now ${session.version}. Queue updated.`);
  }

  private async _emitWebSocketEvents(
    session: Session, 
    participant: Participant,
    nextQuestion: Question | null,
    participantCompletedSession: boolean
  ): Promise<void> {
    // Always emit participant status as it might have changed (currentQ, section, or actual status)
    this.sessionEventsService.emitParticipantStatus(
        session.id, 
        participant.id, 
        participant.status, 
        participant.currentQuestion, 
        participant.currentSection
    );

    if (participantCompletedSession) {
      this.logger.log(`P:${participant.id} COMPLETED. Checking if all participants in S:${session.id} are complete.`);      // Check if all participants who were 'ACTIVE' or 'PENDING' are now 'COMPLETED'
      const activeOrPendingParticipants = session.participants.filter(
        p => p.status !== 'COMPLETED' && p.status !== 'INACTIVE' // INACTIVE means they left or never joined properly
      );

      if (activeOrPendingParticipants.length === 0 && session.participants.some(p => p.status === 'COMPLETED')) { 
        this.logger.log(`All active/pending participants in S:${session.id} have completed. Completing session.`);
        await this.sessionService.completeSession(session.id); // This emits its own session:status event
      } else {
        this.logger.log(`S:${session.id} not yet complete. Active/Pending: ${activeOrPendingParticipants.length}`);
      }
    } else if (nextQuestion) {
      this.logger.log(`Next question for P:${participant.id} is Q:${nextQuestion.id}. Emitting QuestionReady.`);
      this.sessionEventsService.emitQuestionReady(session.id, participant.id, nextQuestion);
    } else {
      // This case: participant not completed, but no next question.
      // Status was already emitted. This might be an error state or an edge case (e.g., queue empty unexpectedly).
      this.logger.warn(`P:${participant.id} is not completed, but no next question was determined. Current status: ${participant.status}. Current Q from emit: ${participant.currentQuestion}`);
    }
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
    let cachedParticipantQueueForRetry: ParticipantQueueCache | null = null; 
    
    // These will be populated by _initializeAndValidateRequest or within the loop.
    // Participant is scoped outside the loop for potential use in final error emit if loop maxes out.
    let participant: Participant | undefined = undefined; 

    while (retries < this.MAX_PROCESS_ANSWER_RETRIES) {
      let session: Session; // Must be defined inside loop for retry logic to fetch fresh session
      let participantQueue: ParticipantQueueCache;
      let answeredQuestionObject: Question;

      try {
        this.logger.log(
          `Attempt #${retries + 1} to process answer for S:${sessionId}, P:${participantId}, Q:${answeredQuestionId}`
        );

        const context = await this._initializeAndValidateRequest(
            sessionId, 
            participantId, 
            answeredQuestionId, 
            retries + 1, 
            cachedParticipantQueueForRetry // Pass queue from previous attempt if retrying
        );

        if (!context) { // Error already logged and possibly emitted by _initializeAndValidateRequest
          return; 
        }
        
        session = context.session;
        participant = context.participant; // Assign to outer-scoped participant
        participantQueue = context.participantQueue;
        answeredQuestionObject = context.answeredQuestionObject;
        
        // If we proceed, cache the current queue state in case of optimistic lock for the next retry
        cachedParticipantQueueForRetry = JSON.parse(JSON.stringify(participantQueue));

        // START MODIFICATION: Prepare context and call evaluateAnswer
        const currentSection = session.sections.find(s => s.id === answeredQuestionObject.sectionId);
        let originalQuestionTextForEvaluation: string | undefined = undefined;

        if (answeredQuestionObject.intent === 'FOLLOW_UP' && answeredQuestionObject.parentQuestionId) {
          const originalBaseQuestion = this.findQuestionInSessionById(session, answeredQuestionObject.parentQuestionId);
          if (originalBaseQuestion) {
            originalQuestionTextForEvaluation = originalBaseQuestion.text;
          }
        }

        const evaluationResult = await this.evaluationService.evaluateAnswer(
          session.title,                                  // sessionTitle
          session.description,                            // sessionDescription
          participant.role,                               // participantAssignedRole
          answeredQuestionObject,                         // question (current one)
          response,                                       // response
          originalQuestionTextForEvaluation,              // originalQuestionTextContext
          currentSection?.goal                            // sectionGoalContext
        );
        // END MODIFICATION

        // START OF TARGETED CHANGE: Fetch currentAnswerEntity and call _runSimilaritySearch
        const currentAnswerEntity = await this.answerService.findOne(answerId);
        let similarAnswersContext: FormattedSimilarAnswerContext[] | null = null; 

        if (!currentAnswerEntity) {
          this.logger.warn(`Could not find current answer ${answerId} in DB to get its embedding. Skipping similarity search context.`);
        } else if (!currentAnswerEntity.embedding) {
          this.logger.log(`Answer ${answerId} found, but has no embedding. Skipping similarity search context.`);
        } else {
           similarAnswersContext = await this._runSimilaritySearch(
            answerId,                           // answerIdToExclude (current answer's ID)
            currentAnswerEntity.embedding,      // targetEmbedding
            sessionId,
            participant.id,                     // currentParticipantId for exclusion
            session                             // sessionForContextLookup
          );
        }
        // END OF TARGETED CHANGE
        
        let nextQuestion: Question | null = null;
        let participantCompletedSession = false;
        let newFollowUpQuestionForSessionPersistence: Question | null = null;

        if (evaluationResult.isSufficient) {
          const sufficientAnswerResult = this._processSufficientAnswer(participantQueue);
          nextQuestion = sufficientAnswerResult.nextQuestion;
          participantCompletedSession = sufficientAnswerResult.participantCompletedSession;
        } else { 
          // Pass similarAnswersContext to _processInsufficientAnswer
          const insufficientAnswerResult = await this._processInsufficientAnswer(
            session,
            participant,
            answeredQuestionObject, 
            response,
            evaluationResult,
            participantQueue,
            similarAnswersContext // <-- Pass the context here
          );
          nextQuestion = insufficientAnswerResult.nextQuestion;
          participantCompletedSession = insufficientAnswerResult.participantCompletedSession;
          newFollowUpQuestionForSessionPersistence = insufficientAnswerResult.newFollowUpQuestionForSessionPersistence;
        }
        
        // Update database entities (session, participant states, new questions)
        // participant object is mutated by this method.
        await this._updateSessionEntities(
            session, 
            participant, 
            participantQueue, 
            nextQuestion, 
            participantCompletedSession, 
            newFollowUpQuestionForSessionPersistence
        );
        
        // Emit WebSocket events based on the outcome
        // The 'participant' object here is the one updated by _updateSessionEntities
        await this._emitWebSocketEvents(
            session, // Pass the session (which now has updated participant states and maybe new questions)
            participant, 
            nextQuestion, 
            participantCompletedSession
        );
        
        return; // Successfully processed

      } catch (error) {
        if (error instanceof OptimisticLockVersionMismatchError) {
          this.logger.warn(
            `Optimistic lock error for S:${sessionId} (Attempt ${retries + 1}). Invalidating session cache and retrying operation...`,
          );
          this.sessionCacheService.del(sessionId); // Invalidate session cache
          cachedParticipantQueueForRetry = null; // Don't reuse queue if session changed drastically
          retries++;
          if (retries >= this.MAX_PROCESS_ANSWER_RETRIES) {
            this.logger.error(
              `Max retries reached for S:${sessionId} due to optimistic lock. Answer processing failed for P:${participantId}, Q:${answeredQuestionId}.`
            );
            // TODO: this.sessionEventsService.emitErrorToParticipant(sessionId, participantId, 'PROCESSING_CONFLICT', 'Could not process your answer due to a server conflict. Please try again.');
            return;
          }
          // Continue to next iteration of while loop for retry
        } else {
          // Unexpected error
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Unexpected error processing answer for S:${sessionId}, P:${participantId}, Q:${answeredQuestionId} (Attempt ${retries + 1}): ${errorMessage}`,
            error instanceof Error ? error.stack : undefined
          );
          // TODO: this.sessionEventsService.emitErrorToParticipant(sessionId, participantId, 'UNEXPECTED_PROCESSING_ERROR', 'An unexpected error occurred while processing your answer.');
          return; // Exit on unexpected error
        }
      }
    }
  }

  // Not in use
  async getNextQuestionForParticipant(sessionId: string, participantId: string): Promise<Question | null> {
    this.logger.log(`Orchestrator: Getting next question for P:${participantId} in S:${sessionId}`);
    const session = await this.getSession(sessionId);
    if (!session) {
      this.logger.error(`S:${sessionId} not found. Cannot get next question.`);
      // TODO: this.sessionEventsService.emitErrorToParticipant(sessionId, participantId, 'SESSION_NOT_FOUND_GNQ', 'Session could not be found.');
      return null;
    }

    const participant = session.participants.find(p => p.id === participantId);
    if (!participant) {
      this.logger.error(`P:${participantId} not found in S:${sessionId}. Cannot get next question.`);
      // TODO: this.sessionEventsService.emitErrorToParticipant(sessionId, participantId, 'PARTICIPANT_NOT_FOUND_GNQ', 'You were not found in this session.');
      return null;
    }
    
    if (participant.status === 'COMPLETED') {
      this.logger.log(`P:${participantId} is already COMPLETED. No next question.`);
      this.sessionEventsService.emitParticipantStatus(sessionId, participantId, 'COMPLETED', '', '');
      return null;
    }

    let participantQueue = await this.getParticipantQueue(sessionId, participantId);

    // If queue doesn't exist, or is somehow empty, or index is out of bounds, try to initialize/re-initialize.
    if (!participantQueue || participantQueue.questions.length === 0 || participantQueue.currentQuestionIndex >= participantQueue.questions.length) {
      this.logger.log(`No existing/valid queue for P:${participantId}, or participant is at end of initialized queue. Initializing/Re-initializing...`);
      participantQueue = await this.initializeParticipantQueue(session, participant);
      if (!participantQueue || participantQueue.questions.length === 0) { 
        this.logger.error(`Failed to initialize queue or queue is empty for P:${participantId}. Cannot determine next question.`);
        // TODO: this.sessionEventsService.emitErrorToParticipant(sessionId, participantId, 'QUEUE_EMPTY_GNQ', 'No questions available in the queue.');
        // Emit current status even if it's problematic
        this.sessionEventsService.emitParticipantStatus(sessionId, participantId, participant.status, participant.currentQuestion, participant.currentSection); 
        return null;
      }
    }
    
    const nextQuestion = participantQueue.questions[participantQueue.currentQuestionIndex];
    
    if (nextQuestion) { 
        this.logger.log(`Next question for P:${participantId} is Q:${nextQuestion.id} from queue index ${participantQueue.currentQuestionIndex}.`);
        
        // Update participant state in the session object before emitting, though this won't be persisted here.
        // Persisting is handled by processParticipantAnswer or session start.
        // This is for consistency in the emitted event.
        participant.currentQuestion = nextQuestion.id;
        participant.currentSection = nextQuestion.sectionId;
        if (participant.status !== 'ACTIVE') { // If they were pending or inactive, mark active.
            participant.status = 'ACTIVE';
        }

        this.sessionEventsService.emitQuestionReady(sessionId, participantId, nextQuestion);
        // We don't persist session/participant changes here; getNextQuestion is read-heavy.
        // Status update to ACTIVE is transient for the event if they were pending, actual persistence happens on answer or session start.
        return nextQuestion;
    } else {
        // This case should ideally be covered by the index check above, or lead to COMPLETED status.
        this.logger.warn(`P:${participantId} in S:${sessionId}: No next question found in queue at index ${participantQueue?.currentQuestionIndex}, but status is not COMPLETED. This might indicate end of queue was reached without explicit completion.`);
        
        // If truly at the end and not completed, mark completed now.
        if(participantQueue && participantQueue.currentQuestionIndex >= participantQueue.questions.length){
            this.logger.log(`P:${participantId} is at/beyond end of queue. Marking COMPLETED in getNextQuestion.`);
            participant.status = 'COMPLETED';
            participant.currentQuestion = ''; 
            participant.currentSection = '';
            participant.completedAt = new Date();
            try {
                session.version += 1;
                await this.persistSession(session); // Persist session with updated participant
                await this.setParticipantQueue(sessionId, participantId, participantQueue); // Persist queue (index might be at end)
                this.sessionEventsService.emitParticipantStatus(sessionId, participant.id, 'COMPLETED', '', '');
                this.logger.log(`P:${participantId} marked COMPLETED and persisted in getNextQuestion.`);
              
                // Check if session is now complete
                const activeOrPendingParticipants = session.participants.filter(p => p.status !== 'COMPLETED' && p.status !== 'INACTIVE');
                if (activeOrPendingParticipants.length === 0 && session.participants.some(p=>p.status === 'COMPLETED')) {
                    this.logger.log(`All active/pending participants in S:${sessionId} have completed after P:${participantId} finished via getNextQuestion. Completing session.`);
                    await this.sessionService.completeSession(sessionId);
                }
            } catch (error) {
              this.logger.error(`Error persisting COMPLETED status for P:${participantId} in getNextQuestion: ${error}`);
            }
        } else if (participant) { 
             // Fallback: emit current known status if not clearly completed.
             this.sessionEventsService.emitParticipantStatus(sessionId, participant.id, participant.status, participant.currentQuestion, participant.currentSection);
        }
        return null;
    }
  }

  // Legacy find method, consider if still needed or can be merged/removed
  // if findQuestionInSessionById covers all uses.
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

