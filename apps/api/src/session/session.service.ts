import { Injectable, NotFoundException, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  SectionType,
  ParticipantStatus,
  SectionStatus,
  Question,
  QuestionIntent,
  Session as TypesSession,
  Participant as TypesParticipant,
  Section as TypesSection,
} from '@rohit-constellation/types';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { CreateAnswerDto } from '../answer/answer.dto';
import { Answer } from '../answer/answer.entity';
import { AnswerService } from '../answer/answer.service';
import { HighlightService } from '../highlight/highlight.service';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { PromptContentGenerationService } from '../prompt-content-generation/prompt-content-generation.service';

import { SessionEventsService } from './session-events.service';
import { CreateSessionDto } from './session.dto';
import { Session } from './session.entity';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
    private readonly eventsService: SessionEventsService,
    private readonly answerService: AnswerService,
    private readonly highlightService: HighlightService,
    @Inject(forwardRef(() => OrchestratorService))
    private readonly orchestratorService: OrchestratorService,
    @InjectRepository(Answer)
    private readonly answerRepository: Repository<Answer>,
    private readonly promptContentGenerationService: PromptContentGenerationService,
  ) {}

  private mapEntityToType(sessionEntity: Session): TypesSession {
    return {
        id: sessionEntity.id,
        template: sessionEntity.template,
        title: sessionEntity.title,
        description: sessionEntity.description,
        type: sessionEntity.type,
        status: sessionEntity.status,
        globalTimeLimit: sessionEntity.globalTimeLimit,
        createdAt: sessionEntity.createdAt,
        expiresAt: sessionEntity.expiresAt,
        createdBy: sessionEntity.createdBy,
        isAnonymous: sessionEntity.isAnonymous,
        participationRule: sessionEntity.participationRule,
        permissions: sessionEntity.permissions,
        participants: sessionEntity.participants as TypesParticipant[], 
        sections: sessionEntity.sections as TypesSection[],
        version: sessionEntity.version,
    };
  }
  
  private mapTypeToEntity(sessionType: TypesSession): Session {
      const entity = new Session();
      Object.assign(entity, sessionType);
      entity.participants = sessionType.participants as any[];
      entity.sections = sessionType.sections as any[];
      return entity;
  }

  private createBaseQuestions(sectionType: SectionType, sectionId: string): Question[] {
    const baseQuestion: Question = {
      id: uuidv4(),
      type: 'TEXT',
      text: `What made you ${sectionType.toLowerCase()}?`,
      sectionId: sectionId,
      order: 1,
      intent: 'BASE' as QuestionIntent,
    };
    return [baseQuestion];
  }

  private createRetroSections(): TypesSection[] {
    const sectionsData: Array<{ name: string; type: SectionType; order: number; goal?: string }> = [
        { name: 'MAD', type: 'MAD', order: 1, goal: "Identify things that caused frustration or impediments." },
        { name: 'SAD', type: 'SAD', order: 2, goal: "Identify things that were disappointing or didn't go well." },
        { name: 'GLAD', type: 'GLAD', order: 3, goal: "Identify things that went well or were positive." },
    ];

    const sections: TypesSection[] = sectionsData.map(data => {
      const sectionId = uuidv4();
      return {
        id: sectionId,
        name: data.name,
        type: data.type,
        order: data.order,
        goal: data.goal,
        timeLimit: 10,
        status: 'PENDING',
        questions: this.createBaseQuestions(data.type, sectionId),
        startedAt: undefined,
        completedAt: undefined,
      };
    });
    return sections;
  }

  async createSession(dto: CreateSessionDto): Promise<TypesSession> {
    this.logger.log(`Creating session with title: ${dto.title}, template: ${dto.template}, customPrompt: ${!!dto.customPrompt}`);
    
    const sessionEntity = new Session();
    sessionEntity.title = dto.title;
    sessionEntity.template = dto.template; 
    sessionEntity.description = dto.description;
    sessionEntity.type = dto.type;
    sessionEntity.globalTimeLimit = dto.globalTimeLimit;
    sessionEntity.expiresAt = typeof dto.expiresAt === 'string' ? new Date(dto.expiresAt) : dto.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
    sessionEntity.createdBy = dto.createdBy;
    sessionEntity.isAnonymous = dto.isAnonymous;
    sessionEntity.participationRule = dto.participationRule;
    sessionEntity.permissions = dto.permissions;
    sessionEntity.status = 'DRAFT';
    sessionEntity.participants = [];

    if (dto.customPrompt) {
      this.logger.log(`Custom prompt provided: "${dto.customPrompt}". Generating content...`);
      try {
        const { sections } = await this.promptContentGenerationService.generateSessionContent(dto.customPrompt);
        sessionEntity.sections = sections;
        // Potentially update sessionEntity.template or type based on generated content if needed
        // For example, if a prompt is used, template might become irrelevant or set to 'CUSTOM_PROMPT_BASED'
        sessionEntity.template = 'PROMPT_GENERATED'; // Indicate that this session was generated from a prompt
      } catch (error) {
        if (error instanceof Error) {
          this.logger.error(`Error generating session content from prompt: ${error.message}`, error.stack);
        } else {
          this.logger.error(`Error generating session content from prompt: ${String(error)}`);
        }
        this.logger.warn('Falling back to default retro sections due to error in prompt generation.');
        sessionEntity.sections = this.createRetroSections(); 
      }
    } else if (dto.template) {
      this.logger.log(`Using template: "${dto.template}" to create sections.`);
      sessionEntity.sections = this.createRetroSections(); // Assuming createRetroSections uses dto.template or is generic
    } else {
      this.logger.warn('Neither custom prompt nor template provided. Creating session with empty sections.');
      sessionEntity.sections = [];
    }
    
    const savedEntity = await this.sessionRepository.save(sessionEntity);
    this.logger.log(`Session created with ID: ${savedEntity.id}`);
    return this.mapEntityToType(savedEntity);
  }

  async findOne(id: string, loadRelations = false): Promise<TypesSession | null> {
    const findOptions = loadRelations 
      ? { where: { id }, relations: ['answers'] }
      : { where: { id } };
    const sessionEntity = await this.sessionRepository.findOne(findOptions);
    if (!sessionEntity) return null;
    return this.mapEntityToType(sessionEntity);
  }
  
  async save(sessionData: TypesSession): Promise<TypesSession> {
    this.logger.log(`Saving session ${sessionData.id} from orchestrator/cache or direct call.`);
    let entityToSave: Session;
    const existingEntity = await this.sessionRepository.findOne({ where: { id: sessionData.id }});

    if (existingEntity) {
        const updateData = { ...sessionData } as Partial<Session>;
        if (typeof (sessionData as any).generatedReportJson === 'string') {
            updateData.generatedReportJson = (sessionData as any).generatedReportJson;
        }
        entityToSave = this.sessionRepository.merge(existingEntity, updateData);
        entityToSave.participants = sessionData.participants as any[];
        entityToSave.sections = sessionData.sections as any[];
    } else {
        this.logger.warn(`Session ${sessionData.id} not found in DB during save. Creating new entity from data.`);
        entityToSave = this.sessionRepository.create(sessionData as unknown as Session);
        if (typeof (sessionData as any).generatedReportJson === 'string') {
            entityToSave.generatedReportJson = (sessionData as any).generatedReportJson;
        }
    }
    
    const savedEntity = await this.sessionRepository.save(entityToSave);
    return this.mapEntityToType(savedEntity);
  }

  async activateSession(id: string): Promise<TypesSession> {
    const session = await this.findOne(id, true);
    if (!session) throw new NotFoundException('Session not found');
    
    session.status = 'ACTIVE';
    
    if (session.participants.length > 0 && session.sections.length > 0) {
        const sortedSections = [...session.sections].sort((a,b) => a.order - b.order);
        const firstSection = sortedSections[0];
        if (firstSection && firstSection.questions.length > 0) {
            const firstQuestion = [...firstSection.questions]
                .filter(q => q.intent === 'BASE')
                .sort((a,b) => a.order - b.order)[0];

            if (firstQuestion) {
                for (const participant of session.participants) {
                    if (participant.status === 'ACTIVE' || participant.status === 'INACTIVE') {
                         if (!participant.currentSection && !participant.currentQuestion) {
                            participant.currentSection = firstSection.id;
                            participant.currentQuestion = firstQuestion.id;
                        }
                        this.eventsService.emitQuestionReady(session.id, participant.id, firstQuestion);
                    }
                }
            }
        }
    }
    return this.save(session);
  }

  async completeSession(id: string): Promise<TypesSession> {
    this.logger.log(`Attempting to complete session S:${id} and generate report.`);
    const sessionEntity = await this.sessionRepository.findOne({ where: { id } });

    if (!sessionEntity) {
      this.logger.error(`Session S:${id} not found for completion.`);
      throw new NotFoundException('Session not found');
    }

    if (sessionEntity.status === 'COMPLETED') {
      this.logger.warn(`Session S:${id} is already marked as COMPLETED. Skipping report generation.`);
      return this.mapEntityToType(sessionEntity);
    }
    
    const allAnswersForSession = await this.answerRepository.findBy({ sessionId: id });

    this.logger.log(`Found ${allAnswersForSession.length} answers for S:${id} to include in report generation.`);

    try {
      const report = await this.highlightService.generateReport({
        session: sessionEntity,
        answers: allAnswersForSession,
      });

      if (report) {
        sessionEntity.generatedReportJson = JSON.stringify(report);
        this.logger.log(`Successfully generated report for S:${id}.`);
      } else {
        this.logger.warn(`Report generation returned null for S:${id}. Session will be completed without a report.`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Error during report generation for S:${id}: ${errorMessage}. Session will be completed without a report.`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    sessionEntity.status = 'COMPLETED';
    
    const savedSessionEntity = await this.sessionRepository.save(sessionEntity);
    this.logger.log(`Session S:${id} successfully marked as COMPLETED ${sessionEntity.generatedReportJson ? 'with' : 'without'} a generated report. New version: ${savedSessionEntity.version}`);
    
    this.eventsService.emitSessionState(id, this.mapEntityToType(savedSessionEntity));
    return this.mapEntityToType(savedSessionEntity);
  }

  async addParticipant(sessionId: string, name: string, role: 'PARTICIPANT' | 'HOST' = 'PARTICIPANT'): Promise<TypesSession> {
    const session = await this.findOne(sessionId, true); 
    if (!session) throw new NotFoundException('Session not found');

    const sortedSections = [...session.sections].sort((a, b) => a.order - b.order);
    let firstSectionId = '';
    let firstQuestionId = '';
    let firstQuestionObject: Question | undefined = undefined;

    if (sortedSections.length > 0) {
        const firstSection = sortedSections[0];
        firstSectionId = firstSection.id;
        const baseQuestionsInFirstSection = [...firstSection.questions]
            .filter(q => q.intent === 'BASE')
            .sort((a,b) => a.order - b.order);
        if (baseQuestionsInFirstSection.length > 0) {
            firstQuestionObject = baseQuestionsInFirstSection[0];
            firstQuestionId = firstQuestionObject.id;
        }
    }

    const newParticipant: TypesParticipant = {
      id: uuidv4(),
      name,
      role: role,
      status: 'ACTIVE',
      currentSection: firstSectionId,
      currentQuestion: firstQuestionId,
      joinedAt: new Date(),
      completedAt: undefined,
    };
    
    session.participants.push(newParticipant);
    
    const updatedSession = await this.save(session);

    this.eventsService.emitParticipantStatus(sessionId, newParticipant.id, 'ACTIVE');

    if (updatedSession.status === 'ACTIVE' && firstQuestionObject) {
        this.eventsService.emitQuestionReady(sessionId, newParticipant.id, firstQuestionObject);
    }
    return updatedSession;
  }

  async updateParticipantStatus(sessionId: string, participantId: string, status: ParticipantStatus): Promise<TypesSession | undefined> {
    const session = await this.findOne(sessionId);
    if (!session) {
        this.logger.warn(`Session ${sessionId} not found for participant status update.`);
        throw new NotFoundException('Session not found');
    }
    const participant = session.participants.find(p => p.id === participantId);

    if (!participant) {
      this.logger.warn(`Participant ${participantId} not found in session ${sessionId} for status update.`);
      return undefined;
    }
    participant.status = status;
    if (status === 'COMPLETED') participant.completedAt = new Date();
    else participant.completedAt = undefined;
    
    const updatedSession = await this.save(session);
    this.eventsService.emitParticipantStatus(sessionId, participantId, status);
    return updatedSession;
  }

  async updateSectionStatus(sessionId: string, sectionId: string, status: SectionStatus): Promise<TypesSession> {
    const session = await this.findOne(sessionId);
    if (!session) throw new NotFoundException('Session not found');
    
    const section = session.sections.find(s => s.id === sectionId);
    if (!section) throw new NotFoundException('Section not found');
    
    section.status = status;
    if (status === 'ACTIVE') section.startedAt = new Date();
    else if (status === 'COMPLETED') section.completedAt = new Date();
    else {
        section.startedAt = undefined;
        section.completedAt = undefined;
    }
    return this.save(session);
  }

  private async getSessionForModification(sessionId: string): Promise<Session | null> {
    return this.sessionRepository.findOne({ 
      where: { id: sessionId } 
    });
  }

  async submitAnswer(
    sessionId: string,
    participantId: string,
    questionId: string,
    responseValue: string | number,
  ): Promise<Answer> {
    const session = await this.getSessionForModification(sessionId);
    if (!session) throw new NotFoundException('Session not found');

    const participant = session.participants.find(p => p.id === participantId);
    if (!participant) throw new NotFoundException('Participant not found');

    const question = session.sections
      .flatMap(s => s.questions || [])
      .find(q => q.id === questionId);
    if (!question) throw new NotFoundException('Question not found in session');

    const responseText = typeof responseValue === 'string' ? responseValue : String(responseValue);

    const answerData: CreateAnswerDto = {
      sessionId,
      participantId,
      questionId,
      response: responseText,
    };

    const savedAnswer = await this.answerService.create(answerData);
    
    this.logger.log(`Answer ${savedAnswer.id} submitted by P:${participantId} for Q:${questionId}. Orchestrating next step.`);

    this.orchestratorService.processParticipantAnswer(
        sessionId,
        participantId,
        questionId,
        responseValue,
        savedAnswer.id
    ).catch(err => {
        this.logger.error(`Error in background orchestrator process for S:${sessionId}, P:${participantId}, A:${savedAnswer.id}: ${err.message}`, err.stack);
    });

    return savedAnswer;
  }
}