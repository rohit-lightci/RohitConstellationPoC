import { Injectable, Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WebSocketServer,
} from '@nestjs/websockets';
import { SESSION_EVENT } from '@rohit-constellation/types';
import { Server, Socket } from 'socket.io';

import { SessionEventsService } from './session-events.service';
import { SessionService } from './session.service';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*', // TODO: Configure this based on environment
  },
  namespace: 'sessions',
})
export class SessionGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SessionGateway.name);

  // Map to track which sessions a socket is connected to
  private socketSessions = new Map<string, Set<string>>();

  // Map to track the mapping of socket ID to participant ID
  private socketToParticipant = new Map<string, { sessionId: string, participantId: string }>();

  constructor(
    private readonly sessionService: SessionService,
    private readonly eventsService: SessionEventsService
  ) {}

  async handleConnection(client: Socket) {
    const sessionId = client.handshake.query.sessionId as string;
    const participantId = client.handshake.query.participantId as string;
    const name = client.handshake.query.name as string;
    const role = client.handshake.query.role as string;

    console.log('Client connecting with details:', {
      socketId: client.id,
      sessionId,
      participantId,
      name,
      role
    });
    
    // Initialize socket sessions tracking
    this.socketSessions.set(client.id, new Set());

    // If we have participant info from query params, try to reconnect
    if (sessionId && participantId && name && role) {
      try {
        console.log('Attempting participant reconnection...');
        const session = await this.sessionService.findOne(sessionId);
        if (!session) {
          console.log('Session not found during reconnection');
          return;
        }

        const participant = session.participants.find(p => p.id === participantId);
        if (!participant) {
          console.log('Participant not found during reconnection');
          return;
        }

        // Verify participant details match
        if (participant.name !== name || participant.role !== role) {
          console.log('Participant details mismatch during reconnection:', {
            stored: { name: participant.name, role: participant.role },
            received: { name, role }
          });
          return;
        }

        // Join the session room
        await client.join(`session:${sessionId}`);
        this.socketSessions.get(client.id)?.add(sessionId);
        console.log(`Client ${client.id} joined session room ${sessionId}`);

        // Join participant room
        await client.join(`participant:${participantId}`);
        console.log(`Client ${client.id} joined participant room ${participantId}`);

        // Update participant status to ACTIVE
        await this.sessionService.updateParticipantStatus(
          sessionId,
          participantId,
          'ACTIVE'
        );
        console.log(`Updated participant ${participantId} status to ACTIVE`);

        // Store the mapping
        this.socketToParticipant.set(client.id, { sessionId, participantId });
        console.log(`Stored socket mapping for ${client.id}`);

        // Emit updated session state
        const sessionState = {
          id: sessionId,
          status: session.status,
          participants: session.participants.map(p => ({
            id: p.id,
            name: p.name,
            role: p.role,
            status: p.id === participantId ? 'ACTIVE' : p.status,
            isHost: p.role === 'HOST'
          }))
        };
        console.log('Emitting updated session state after reconnection:', sessionState);
        this.server.to(`session:${sessionId}`).emit(SESSION_EVENT.STATE, sessionState);

        console.log(`Participant ${participantId} reconnected successfully`);
      } catch (error) {
        console.error('Error during participant reconnection:', error);
      }
    } else {
      console.log('No participant info provided, treating as new connection');
    }
  }

  async handleDisconnect(client: Socket) {
    const sessionId = client.handshake.query.sessionId;
    console.log(`Client disconnecting with ID: ${client.id}, sessionId: ${sessionId}`);
    this.socketSessions.delete(client.id);

    const mapping = this.socketToParticipant.get(client.id);
    if (mapping) {
      await this.sessionService.updateParticipantStatus(
        mapping.sessionId,
        mapping.participantId,
        'INACTIVE'
      );
      this.socketToParticipant.delete(client.id);

      // After disconnect, emit updated session state if sessionId is present
      if (sessionId) {
        const session = await this.sessionService.findOne(sessionId as string);
        if (session) {
          const sessionState = {
            id: sessionId,
            status: session.status,
            participants: session.participants.map(p => ({
              id: p.id,
              name: p.name,
              role: p.role,
              status: p.status,
              isHost: false // TODO: set true for host
            }))
          };
          console.log('Emitting session state to all clients in session:', sessionState);
          this.server.to(`session:${sessionId}`).emit(SESSION_EVENT.STATE, sessionState);
        }
      }
    }
  }

  @SubscribeMessage(SESSION_EVENT.PARTICIPANT_JOINED)
  async handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { name: string; role: string }
  ) {
    const sessionId = client.handshake.query.sessionId as string;
    console.log('Join session request received:', {
      clientId: client.id,
      sessionId,
      data,
      query: client.handshake.query
    });
    
    if (!sessionId) {
      console.error('No sessionId provided in query params');
      return { status: 'error', message: 'No sessionId provided' };
    }

    // Join the session room
    await client.join(`session:${sessionId}`);
    this.socketSessions.get(client.id)?.add(sessionId);
    console.log(`Client ${client.id} joined session ${sessionId}`);

    // Add participant to session
    try {
      const session = await this.sessionService.addParticipant(sessionId, data.name, data.role as 'PARTICIPANT' | 'HOST');
      const participant = session.participants[session.participants.length - 1];
      
      // Join participant room
      await client.join(`participant:${participant.id}`);
      console.log(`Client ${client.id} joined participant room ${participant.id}`);

      // Emit updated session state to all clients in the session
      const sessionState = {
        id: sessionId,
        status: session.status,                                                                             
        participants: session.participants.map(p => ({
          id: p.id,
          name: p.name,
          role: p.id === participant.id ? data.role : p.role,
          status: p.status,
          isHost: p.id === participant.id && data.role === 'HOST'
        }))
      };
      this.server.to(`session:${sessionId}`).emit(SESSION_EVENT.STATE, sessionState);
      // Emit session state to the joining client as well
      client.emit(SESSION_EVENT.STATE, sessionState);

      // Store the mapping of socket ID to participant ID
      this.socketToParticipant.set(client.id, { sessionId, participantId: participant.id });

      return { 
        status: 'joined', 
        sessionId,
        participantId: participant.id
      };
    } catch (error) {
      console.error('Error adding participant:', error);
      return { 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Unknown error occurred' 
      };
    }
  }

  @SubscribeMessage(SESSION_EVENT.LEAVE)
  async handleLeaveSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { participantId: string }
  ) {
    const sessionId = client.handshake.query.sessionId as string;
    console.log(`Client ${client.id} leaving session ${sessionId}`);
    
    if (sessionId) {
      await client.leave(`session:${sessionId}`);
      this.socketSessions.get(client.id)?.delete(sessionId);
    }

    if (data.participantId) {
      await client.leave(`participant:${data.participantId}`);
      // Update participant status to inactive
      try {
        await this.sessionService.updateParticipantStatus(
          sessionId,
          data.participantId,
          'INACTIVE'
        );
      } catch (error) {
        console.error('Error updating participant status:', error);
      }
    }

    // Remove mapping
    this.socketToParticipant.delete(client.id);

    // Emit updated session state after participant leaves
    if (sessionId) {
      console.log('Emitting updated session state after participant leaves');
      const session = await this.sessionService.findOne(sessionId);
      if (session) {
        const sessionState = {
          id: sessionId,
          status: session.status.toLowerCase(),
          participants: session.participants.map(p => ({
            id: p.id,
            name: p.name,
            role: p.role,
            status: p.status,
            isHost: false // TODO: set true for host
          }))
        };
        this.server.to(`session:${sessionId}`).emit(SESSION_EVENT.STATE, sessionState);
      }
    }

    return { status: 'left', sessionId };
  }

  @SubscribeMessage(SESSION_EVENT.START)
  async handleSessionStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string }
  ) {
    const { sessionId } = data;
    console.log(`Session start requested for sessionId: ${sessionId}`);

    // Activate the session
    const session = await this.sessionService.activateSession(sessionId);
    console.log('Session activated', session);

    console.log('Participants in session', session.participants);
    // Emit updated session state
    const sessionState = {
      id: sessionId,
      status: session.status,
      participants: session.participants.map(p => ({
        id: p.id,
        name: p.name,
        role: p.role,
        status: p.status,
        isHost: false // TODO: set true for host
      }))
    };
    this.server.to(`session:${sessionId}`).emit(SESSION_EVENT.STATE, sessionState);

    // Emit the first question to each participant
    // if (session && session.sections.length > 0) {
    //   const firstSection = session.sections[0];
    //   const firstQuestion = firstSection.questions[0];
    //   for (const participant of session.participants) {
    //     if (firstQuestion) {
    //       this.server.to(`participant:${participant.id}`).emit(SESSION_EVENT.QUESTION_READY, {
    //         sessionId,
    //         participantId: participant.id,
    //         question: firstQuestion,
    //       });
    //     }
    //   }
    // }
  }

  @SubscribeMessage(SESSION_EVENT.END)
  async handleSessionEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string }
  ) {
    const { sessionId } = data;
    console.log(`Session end requested for sessionId: ${sessionId}`);

    // Get and complete the session
    const updatedSession = await this.sessionService.completeSession(sessionId);

    // Emit updated session state
    const sessionState = {
      id: sessionId,
      status: updatedSession.status,
      participants: updatedSession.participants.map(p => ({
        id: p.id,
        name: p.name,
        role: p.role,
        status: p.status,
        isHost: false // TODO: set true for host
      }))
    };
    this.server.to(`session:${sessionId}`).emit(SESSION_EVENT.STATE, sessionState);
  }

  @SubscribeMessage(SESSION_EVENT.GET_QUESTION)
  async handleGetQuestion(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string, participantId: string }
  ) {
    const { sessionId, participantId } = data;
    try {
      const session = await this.sessionService.findOne(sessionId);
      if (!session) {
        client.emit('error', { message: 'Session not found' });
        return;
      }
      const participant = session.participants.find(p => p.id === participantId);
      if (!participant) {
        client.emit('error', { message: 'Participant not found' });
        return;
      }
      if (!participant.currentQuestion) {
         this.eventsService.emitParticipantStatus(sessionId, participantId, 'COMPLETED');
        // client.emit('error', { message: 'Participant has no current question or has completed the session.' });
        return;
      }
      const question = session.sections
        .flatMap(s => s.questions)
        .find(q => q.id === participant.currentQuestion);

      if (question) {
        this.eventsService.emitQuestionReady(sessionId, participantId, question);
      } else {
        // This case might mean the participant.currentQuestion is stale or points to a non-existent question
        client.emit('error', { message: 'Current question not found in session data.' });
        // Potentially, try to reset participant to a valid state or mark as completed
        this.logger.warn(`Participant ${participantId} in session ${sessionId} has currentQuestion ${participant.currentQuestion} which was not found.`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error fetching question.';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error in handleGetQuestion for S:${sessionId} P:${participantId}: ${errorMessage}`, errorStack);
      client.emit('error', { message: 'Error fetching question.' });
    }
  }

  @SubscribeMessage(SESSION_EVENT.QUESTION_ANSWER)
  async handleQuestionAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { questionId: string; answer: string | number; participantId: string },
  ) {
    const sessionId = client.handshake.query.sessionId as string;
    if (!sessionId) {
      console.error('No sessionId found in handshake query for QUESTION_ANSWER');
      client.emit('error', 'Session ID not found for processing answer.');
      return { status: 'error', message: 'Session ID not found in connection.' };
    }

    const { questionId, answer, participantId } = data;

    if (!participantId) {
      console.error('No participantId received in QUESTION_ANSWER payload');
      client.emit('error', 'Participant ID is missing for processing answer.');
      return { status: 'error', message: 'Participant ID is missing in the request.' };
    }

    try {
      console.log(`Processing answer from participant ${participantId} for question ${questionId} in session ${sessionId}`);
      
      // Call the simplified service method
      const savedAnswer = await this.sessionService.submitAnswer(
        sessionId,
        participantId,
        questionId,
        answer,
      );
      
      console.log('Answer successfully saved:', savedAnswer);

      // Emit an event to notify that a new answer has been submitted (e.g., for admin or to update UI if answers are public)
      // This event is different from QUESTION_READY or ALL_QUESTIONS_COMPLETED.
      // Let's define a new event for this, e.g., SESSION_EVENT.NEW_ANSWER_SUBMITTED
      // For now, we will assume the client that submitted the answer gets an ack, 
      // and other clients might listen for a more general new answer event.
      // this.server.to(`session:${sessionId}`).emit(SESSION_EVENT.NEW_ANSWER_SUBMITTED, savedAnswer);

      // Acknowledge successful processing to the sender
      return { status: 'received', answerId: savedAnswer.id };

    } catch (error) {
      console.error(`Error processing answer for participant ${participantId} in session ${sessionId}:`, error);
      client.emit('error', `Failed to process answer: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { 
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to process answer.', 
      };
    }
  }
} 