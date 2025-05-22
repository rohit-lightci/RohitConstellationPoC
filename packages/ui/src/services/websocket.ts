import { io, Socket } from 'socket.io-client';
import { SessionParticipant, SessionState } from '@rohit-constellation/types';

// Add environment variable type declaration
declare global {
  interface ImportMeta {
    env: {
      VITE_WS_URL?: string;
      VITE_API_URL?: string;
    };
  }
}


class WebSocketService {
  private socket: Socket | null = null;

  connect(sessionId: string) {
    if (this.socket?.connected) {
      console.log('Socket already connected, skipping connection');
      return;
    }

    const namespace = 'sessions';

    console.log('Connecting to WebSocket with sessionId:', sessionId);
    this.socket = io(
      (import.meta.env.VITE_WS_URL || 'ws://localhost:3000/') + namespace,
      {
        query: { sessionId }
      }
    );

    this.socket.on('connect', () => {
      console.log('Connected to WebSocket server with ID:', this.socket?.id);
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from WebSocket server. Reason:', reason);
    });

    this.socket.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Session Events
  onSessionStateUpdate(callback: (state: SessionState) => void) {
    this.socket?.on('session:state', callback);
  }

  onParticipantJoined(callback: (participant: SessionParticipant) => void) {
    this.socket?.on('session:participant:joined', callback);
  }

  onParticipantLeft(callback: (participantId: string) => void) {
    this.socket?.on('session:participant:left', callback);
  }

  // Participant Actions
  joinSession(name: string, role: string) {
    console.log('Attempting to join session with:', { name, role });
    this.socket?.emit('session:join', { name, role }, (response: any) => {
      console.log('Join session response:', response);
    });
  }

  leaveSession() {
    this.socket?.emit('session:leave');
  }

  // Host Actions
  startSession() {
    this.socket?.emit('session:start');
  }

  endSession() {
    this.socket?.emit('session:end');
  }

  nextQuestion() {
    this.socket?.emit('session:question:next');
  }

  // Question Actions
  submitAnswer(questionId: string, answer: any) {
    this.socket?.emit('session:question:answer', { questionId, answer });
  }

  // Cleanup
  removeAllListeners() {
    this.socket?.removeAllListeners();
  }

  // Generic event listener
  on(event: string, callback: (...args: any[]) => void) {
    this.socket?.on(event, callback);
  }

  // Generic event emitter
  emit(event: string, data: any) {
    this.socket?.emit(event, data);
  }
}

export const websocketService = new WebSocketService(); 