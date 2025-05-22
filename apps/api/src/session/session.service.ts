import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SectionType, ParticipantStatus, SectionStatus } from '@rohit-constellation/types';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { SessionEventsService } from './session-events.service';
import { CreateSessionDto } from './session.dto';
import { Session } from './session.entity';

// import { SessionStatus } from '@rohit-constellation/types';

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
    private eventsService: SessionEventsService,
  ) {}

  private createBaseQuestions(sectionType: SectionType) {
    const baseQuestion = {
      id: uuidv4(),
      type: 'TEXT' as const,
      text: `What made you ${sectionType.toLowerCase()}?`,
      sectionId: '',  // Will be set when section is created
      order: 1,
      isBaseQuestion: true,
    };

    return [baseQuestion];
  }

  private createRetroSections() {
    const sections = ['MAD', 'SAD', 'GLAD'].map(type => ({
      id: uuidv4(),
      type: type as SectionType,
      timeLimit: 10,  // 10 minutes per section
      status: 'PENDING' as const,
      questions: this.createBaseQuestions(type as SectionType),
      startedAt: null,
      completedAt: null,
    }));

    // Set section IDs in questions
    sections.forEach(section => {
      section.questions.forEach(question => {
        question.sectionId = section.id;
      });
    });

    return sections;
  }

  async createSession(dto: CreateSessionDto): Promise<Session> {
    console.log('Creating session with dto:', dto);
    const session = new Session();
    
    // Set all fields from DTO
    session.title = dto.title;
    session.template = dto.template;
    session.description = dto.description;
    session.type = dto.type;
    session.globalTimeLimit = dto.globalTimeLimit;
    session.expiresAt = dto?.expiresAt ?? new Date(new Date().setDate(new Date().getDate() + 1));
    session.createdBy = dto.createdBy;
    session.isAnonymous = dto.isAnonymous;
    session.participationRule = dto.participationRule;
    session.permissions = dto.permissions;

    // Set default values
    session.status = 'DRAFT';
    session.participants = [];
    session.sections = this.createRetroSections();

    return this.sessionRepository.save(session);
  }

  // TODO:
  // Use admin provided session details:
  // Use template to generate sections:
  // For each section, generate base questions
  // Push each section - there will be set of questions for each section
  // Think of like a tree structure, where each section is a node and each question is a leaf
  // Store all of this in a node memory

  // Also create a session with expiry date
  // Also add active flag for the session
  // When admin lanuch a session, set the active flag to true
  //


  // Session will have partipants list with their status: active, inactive, completed
  // For each partipant, create a object with name, id, role and status


  // when user joins a session, create a {k:v} key being participant id and value being question tree for that participant

  // When admin makes session active, client send a request to fetch question with payload: response?: string, questionId: string, participantId: string, action: string
  // for first time, action will be "start"
  // response is provided when user answers a question, action will be "answer" and response will be the answer, questionid will be the id of the question that was answered


  // For each response:
    // update the question tree for the participant with the response and all other details
    // ingest in pinecone vector db
    // run similarity search to get similar context for the response and send llm to generate the next question
    // Evaualtor will evaulte if response is enough to move to next question or not
    // store this in the question tree for the participant
    // send an event to the client through websocket to tell new question is ready
    // client will send an action "next" to get the next question, orchestrator will pull the question from the question tree for the participant and send it to the client
    //


  async getSession(id: string): Promise<Session> {
    return this.sessionRepository.findOne({ where: { id } });
  }

  async activateSession(id: string): Promise<Session> {
    const session = await this.getSession(id);
    if (!session) {
      throw new Error('Session not found');
    }

    session.status = 'ACTIVE';
    const updatedSession = await this.sessionRepository.save(session);
    
    // Emit session status change
    await this.eventsService.emitSessionStatus(id, 'ACTIVE');
    
    // Emit section status for the first section
    if (session.sections.length > 0) {
      const firstSection = session.sections[0];
      await this.eventsService.emitSectionStatus(id, firstSection.id, 'ACTIVE');
    }

    return updatedSession;
  }

  async addParticipant(sessionId: string, name: string): Promise<Session> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const participant = {
      id: uuidv4(),
      name,
      role: 'PARTICIPANT' as const,
      status: 'ACTIVE' as const,
      currentSection: session.sections[0]?.id || '',
      currentQuestion: session.sections[0]?.questions[0]?.id || '',
      joinedAt: new Date(),
    };

    session.participants.push(participant);
    const updatedSession = await this.sessionRepository.save(session);

    // Emit participant status
    await this.eventsService.emitParticipantStatus(
      sessionId,
      participant.id,
      'ACTIVE'
    );

    // If session is active, emit the first question
    if (session.status === 'ACTIVE' && session.sections[0]?.questions[0]) {
      await this.eventsService.emitQuestionReady(
        sessionId,
        participant.id,
        session.sections[0].questions[0]
      );
    }

    return updatedSession;
  }

  async updateParticipantStatus(
    sessionId: string,
    participantId: string,
    status: ParticipantStatus
  ): Promise<Session> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const participant = session.participants.find(p => p.id === participantId);
    if (!participant) {
      throw new Error('Participant not found');
    }

    participant.status = status;
    if (status === 'COMPLETED') {
      participant.completedAt = new Date();
    }

    const updatedSession = await this.sessionRepository.save(session);
    
    // Emit participant status change
    await this.eventsService.emitParticipantStatus(
      sessionId,
      participantId,
      status
    );

    return updatedSession;
  }

  async updateSectionStatus(
    sessionId: string,
    sectionId: string,
    status: SectionStatus
  ): Promise<Session> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const section = session.sections.find(s => s.id === sectionId);
    if (!section) {
      throw new Error('Section not found');
    }

    section.status = status;
    if (status === 'ACTIVE') {
      section.startedAt = new Date();
    } else if (status === 'COMPLETED') {
      section.completedAt = new Date();
    }

    const updatedSession = await this.sessionRepository.save(session);
    
    // Emit section status change
    await this.eventsService.emitSectionStatus(
      sessionId,
      sectionId,
      status
    );

    return updatedSession;
  }
}