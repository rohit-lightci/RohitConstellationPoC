import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { SectionType, ParticipantStatus, SectionStatus, Question } from '@rohit-constellation/types';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { Answer } from '../answer/answer.entity';
import { AnswerService } from '../answer/answer.service';

import { SessionEventsService } from './session-events.service';
import { CreateSessionDto } from './session.dto';
import { Session } from './session.entity';

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
    private eventsService: SessionEventsService,
    private answerService: AnswerService,
  ) {}

  private createBaseQuestions(sectionType: SectionType): Question[] {
    const baseQuestion: Question = {
      id: uuidv4(),
      type: 'TEXT' as const,
      text: `What made you ${sectionType.toLowerCase()}?`,
      sectionId: '', 
      order: 1,
      isBaseQuestion: true,
    };
    return [baseQuestion];
  }

  private createRetroSections(): Session['sections'] {
    const sections = ['MAD', 'SAD', 'GLAD'].map((type, index) => ({
      id: uuidv4(),
      type: type as SectionType,
      order: index + 1, // Adding order to sections for predictable progression
      timeLimit: 10, 
      status: 'PENDING' as const,
      questions: this.createBaseQuestions(type as SectionType),
      startedAt: undefined,
      completedAt: undefined,
    }));
    sections.forEach(section => {
      section.questions.forEach(question => {
        question.sectionId = section.id;
      });
    });
    return sections;
  }

  async createSession(dto: CreateSessionDto): Promise<Session> {
    const session = new Session();
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
    session.status = 'DRAFT';
    session.participants = [];
    session.sections = this.createRetroSections();
    return this.sessionRepository.save(session);
  }

  async getSession(id: string): Promise<Session | null> {
    return this.sessionRepository.findOne({ where: { id } });
  }

  async activateSession(id: string): Promise<Session> {
    const session = await this.getSession(id);
    if (!session) throw new NotFoundException('Session not found');
    session.status = 'ACTIVE';
    // When session is activated, if there are participants, proactively send them the first question.
    if (session.participants.length > 0 && session.sections.length > 0 && session.sections[0].questions.length > 0) {
        const firstSection = session.sections.sort((a,b) => a.order - b.order)[0];
        const firstQuestion = firstSection.questions.sort((a,b) => a.order - b.order)[0];
        for (const participant of session.participants) {
            if (participant.status === 'ACTIVE') { // Only send to active participants not yet completed
                 // Update participant's current question/section pointers if they are empty
                 if (!participant.currentSection && !participant.currentQuestion) {
                    participant.currentSection = firstSection.id;
                    participant.currentQuestion = firstQuestion.id;
                }
                await this.eventsService.emitQuestionReady(session.id, participant.id, firstQuestion);
            }
        }
    }
    return this.sessionRepository.save(session);
  }

  async completeSession(id: string): Promise<Session> {
    const session = await this.getSession(id);
    if (!session) throw new NotFoundException('Session not found');
    session.status = 'COMPLETED';
    return this.sessionRepository.save(session);
  }

  async addParticipant(sessionId: string, name: string, role: string = 'PARTICIPANT'): Promise<Session> {
    const session = await this.getSession(sessionId);
    if (!session) throw new NotFoundException('Session not found');
    
    const sortedSections = session.sections.sort((a, b) => a.order - b.order);
    const firstSectionId = sortedSections?.[0]?.id || '';
    const firstQuestionId = sortedSections?.[0]?.questions?.sort((a,b) => a.order - b.order)?.[0]?.id || '';

    const newParticipant: Session['participants'][0] = {
      id: uuidv4(),
      name,
      role: role as 'PARTICIPANT' | 'HOST',
      status: 'ACTIVE' as const,
      currentSection: firstSectionId,
      currentQuestion: firstQuestionId,
      joinedAt: new Date(),
      completedAt: undefined,
    };
    session.participants.push(newParticipant);
    const updatedSession = await this.sessionRepository.save(session); // Save first to persist participant

    await this.eventsService.emitParticipantStatus(sessionId, newParticipant.id, 'ACTIVE');

    if (session.status === 'ACTIVE' && firstQuestionId) {
        const firstQuestion = sortedSections?.[0]?.questions?.find(q => q.id === firstQuestionId);
        if (firstQuestion) {
             await this.eventsService.emitQuestionReady(sessionId, newParticipant.id, firstQuestion);
        }
    }
    return updatedSession; // Return the session state after participant is added and potential first Q sent
  }

  async updateParticipantStatus(sessionId: string, participantId: string, status: ParticipantStatus): Promise<Session | undefined> {
    const session = await this.getSession(sessionId);
    if (!session) throw new NotFoundException('Session not found');
    const participant = session.participants.find(p => p.id === participantId);
    if (!participant) {
      console.warn(`Participant not found for status update: ${participantId} in session ${sessionId}`);
      return undefined;
    }
    participant.status = status;
    if (status === 'COMPLETED') participant.completedAt = new Date();
    else participant.completedAt = undefined;
    const updatedSession = await this.sessionRepository.save(session);
    // Emit status change AFTER saving
    await this.eventsService.emitParticipantStatus(sessionId, participantId, status);
    return updatedSession;
  }

  async updateSectionStatus(sessionId: string, sectionId: string, status: SectionStatus): Promise<Session> {
    const session = await this.getSession(sessionId);
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
    return this.sessionRepository.save(session);
  }

  private async _advanceParticipantProgress(sessionId: string, participantId: string, answeredQuestionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      console.error(`_advanceParticipantProgress: Session ${sessionId} not found.`);
      throw new InternalServerErrorException('Session not found during progress advancement.');
    }

    const participant = session.participants.find(p => p.id === participantId);
    if (!participant) {
      console.error(`_advanceParticipantProgress: Participant ${participantId} not found in session ${sessionId}.`);
      throw new InternalServerErrorException('Participant not found during progress advancement.');
    }

    if (participant.status === 'COMPLETED') {
      console.log(`_advanceParticipantProgress: Participant ${participantId} already completed. No advancement.`);
      return;
    }
    if (participant.currentQuestion !== answeredQuestionId) {
      console.warn(`_advanceParticipantProgress: Answered QID ${answeredQuestionId} doesn't match current QID ${participant.currentQuestion} for P ${participantId}. No advancement.`);
      return; 
    }

    const sortedSections = [...session.sections].sort((a, b) => a.order - b.order);
    const currentSectionIndex = sortedSections.findIndex(s => s.id === participant.currentSection);
    if (currentSectionIndex === -1) {
      console.error(`_advanceParticipantProgress: Current section ${participant.currentSection} not found for P ${participantId}. Marking completed.`);
      participant.currentQuestion = '';
      participant.status = 'COMPLETED';
      participant.completedAt = new Date();
      await this.sessionRepository.save(session); 
      await this.eventsService.emitParticipantStatus(sessionId, participantId, 'COMPLETED');
      return;
    }
    const currentSection = sortedSections[currentSectionIndex];
    const sortedQuestions = [...currentSection.questions].sort((a, b) => a.order - b.order);
    const currentQuestionIndex = sortedQuestions.findIndex(q => q.id === participant.currentQuestion);

    if (currentQuestionIndex === -1) {
      console.error(`_advanceParticipantProgress: Current QID ${participant.currentQuestion} not found in section ${currentSection.id} for P ${participantId}. Marking completed.`);
      participant.currentQuestion = '';
      participant.status = 'COMPLETED';
      participant.completedAt = new Date();
      await this.sessionRepository.save(session);
      await this.eventsService.emitParticipantStatus(sessionId, participantId, 'COMPLETED');
      return;
    }

    let nextQuestion: Question | null = null;
    if (currentQuestionIndex < sortedQuestions.length - 1) {
      nextQuestion = sortedQuestions[currentQuestionIndex + 1];
      participant.currentQuestion = nextQuestion.id;
      // currentSection remains the same
    } else {
      // Try to find next section
      if (currentSectionIndex < sortedSections.length - 1) {
        for (let i = currentSectionIndex + 1; i < sortedSections.length; i++) {
          const nextPotentialSection = sortedSections[i];
          const sortedNextSectionQuestions = [...nextPotentialSection.questions].sort((a, b) => a.order - b.order);
          if (sortedNextSectionQuestions.length > 0) {
            nextQuestion = sortedNextSectionQuestions[0];
            participant.currentSection = nextPotentialSection.id;
            participant.currentQuestion = nextQuestion.id;
            break;
          }
        }
      }
    }

    if (!nextQuestion) {
      participant.currentQuestion = '';
      participant.currentSection = ''; // Clear section too
      participant.status = 'COMPLETED';
      participant.completedAt = new Date();
      console.log(`_advanceParticipantProgress: No next question for P ${participantId}. Marked COMPLETED.`);
      await this.sessionRepository.save(session);
      await this.eventsService.emitParticipantStatus(sessionId, participantId, 'COMPLETED');
    } else {
      console.log(`_advanceParticipantProgress: P ${participantId} advanced to QID ${nextQuestion.id} in Section ${participant.currentSection}.`);
      await this.sessionRepository.save(session); // Save participant state changes
      // Proactively emit QUESTION_READY for the next question
      await this.eventsService.emitQuestionReady(sessionId, participantId, nextQuestion);
    }
  }

  async submitAnswer(
    sessionId: string,
    participantId: string,
    questionId: string,
    response: string | number,
  ): Promise<Answer> {
    const session = await this.getSession(sessionId); 
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const participant = session.participants.find(p => p.id === participantId);
    if (!participant) {
      throw new NotFoundException('Participant not found in this session');
    }

    if (participant.status === 'COMPLETED') {
      throw new Error('Participant has already completed the session.');
    }

    if (participant.currentQuestion !== questionId) {
        console.warn(`SubmitAnswer: P ${participantId} trying to answer Q ${questionId} but current is ${participant.currentQuestion}`);
        throw new Error('Submitted answer is not for the participant\'s current question.');
    }
    
    const questionExists = session.sections.some(s =>
        s.questions.some(q => q.id === questionId)
    );
    if (!questionExists) {
        throw new NotFoundException('Question ID does not exist in session configuration.');
    }

    const savedAnswer = await this.answerService.create({
      sessionId,
      participantId,
      questionId,
      response,
    });

    // After successfully saving, advance participant's progress internally.
    // This will also emit QUESTION_READY if there's a next question.
    await this._advanceParticipantProgress(sessionId, participantId, questionId);

    return savedAnswer;
  }
}