import { Injectable } from '@nestjs/common';
import {
  WebSocketGateway,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WebSocketServer,
} from '@nestjs/websockets';
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

  // Map to track which sessions a socket is connected to
  private socketSessions = new Map<string, Set<string>>();

  // Map to track the mapping of socket ID to participant ID
  private socketToParticipant = new Map<string, { sessionId: string, participantId: string }>();

  constructor(
    private readonly sessionService: SessionService,
    private readonly eventsService: SessionEventsService
  ) {}

  async handleConnection(client: Socket) {
    const sessionId = client.handshake.query.sessionId;
    console.log(`Client connecting with ID: ${client.id}, sessionId: ${sessionId}`);
    this.socketSessions.set(client.id, new Set());
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
        const session = await this.sessionService.getSession(sessionId as string);
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
          console.log('Emitting session state to all clients in session:', sessionState);
          this.server.to(`session:${sessionId}`).emit('session:state', sessionState);
        }
      }
    }
  }

  @SubscribeMessage('session:join')
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
      const session = await this.sessionService.addParticipant(sessionId, data.name);
      const participant = session.participants[session.participants.length - 1];
      
      // Join participant room
      await client.join(`participant:${participant.id}`);
      console.log(`Client ${client.id} joined participant room ${participant.id}`);

      // Emit updated session state to all clients in the session
      const sessionState = {
        id: sessionId,
        status: session.status.toLowerCase(),
        participants: session.participants.map(p => ({
          id: p.id,
          name: p.name,
          role: p.role,
          status: p.status,
          isHost: false // TODO: Add host flag based on session creator
        }))
      };
      this.server.to(`session:${sessionId}`).emit('session:state', sessionState);
      // Emit session state to the joining client as well
      client.emit('session:state', sessionState);

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

  @SubscribeMessage('session:leave')
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

    // Emit updated session state after participant leaves
    if (sessionId) {
      console.log('Emitting updated session state after participant leaves');
      const session = await this.sessionService.getSession(sessionId);
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
        this.server.to(`session:${sessionId}`).emit('session:state', sessionState);
      }
    }

    return { status: 'left', sessionId };
  }
} 