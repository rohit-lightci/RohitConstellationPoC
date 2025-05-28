import { Injectable } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Question, ParticipantStatus, SectionStatus, SESSION_EVENT, Session } from '@rohit-constellation/types';
import { Server } from 'socket.io';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*', // TODO: Configure this based on environment
  },
  namespace: 'sessions',
})
export class SessionEventsService {
  @WebSocketServer()
  server: Server;

  // Event emitters for different session events
  async emitQuestionReady(sessionId: string, participantId: string, question: Question) {
    this.server.to(`participant:${participantId}`).emit(SESSION_EVENT.QUESTION_READY, {
      sessionId,
      participantId,
      question,
    });
  }

  async emitParticipantStatus(
    sessionId: string, 
    participantId: string, 
    status: ParticipantStatus, 
    currentQuestionId?: string,
    currentSectionId?: string,
  ) {
    const payload: any = {
      sessionId,
      participantId,
      status,
    };
    if (currentQuestionId) payload.currentQuestionId = currentQuestionId;
    if (currentSectionId) payload.currentSectionId = currentSectionId;

    this.server.to(`session:${sessionId}`).emit(SESSION_EVENT.PARTICIPANT_STATUS, payload);
    if (status === 'COMPLETED') {
        this.server.to(`participant:${participantId}`).emit(SESSION_EVENT.PARTICIPANT_STATUS, payload);
    }
  }

  async emitSectionStatus(sessionId: string, sectionId: string, status: SectionStatus, currentQuestionId?: string) {
    const payload: any = {
        sessionId,
        sectionId,
        status,
    };
    if (currentQuestionId) payload.currentQuestionId = currentQuestionId;
    this.server.to(`session:${sessionId}`).emit(SESSION_EVENT.SECTION_STATUS, payload);
  }

  // For general session state updates (e.g. participant list changes, session ended)
  async emitSessionState(sessionId: string, sessionData: Partial<Session>) {
    this.server.to(`session:${sessionId}`).emit(SESSION_EVENT.STATE, sessionData);
  }

  // To inform a specific participant about an error
  async emitErrorToParticipant(sessionId: string, participantId: string, errorMessage: string) {
    this.server.to(`participant:${participantId}`).emit(SESSION_EVENT.ERROR, {
      sessionId,
      message: errorMessage,
    });
  }
} 