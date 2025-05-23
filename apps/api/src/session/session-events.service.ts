import { Injectable } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { ParticipantStatus, SectionStatus } from '@rohit-constellation/types';
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
  async emitQuestionReady(sessionId: string, participantId: string, question: any) {
    this.server.to(`participant:${participantId}`).emit('question:ready', {
      sessionId,
      participantId,
      question,
    });
  }

  async emitParticipantStatus(sessionId: string, participantId: string, status: ParticipantStatus) {
    this.server.to(`session:${sessionId}`).emit('participant:status', {
      sessionId,
      participantId,
      status,
    });
  }

  async emitSectionStatus(sessionId: string, sectionId: string, status: SectionStatus) {
    this.server.to(`session:${sessionId}`).emit('section:status', {
      sessionId,
      sectionId,
      status,
    });
  }
} 