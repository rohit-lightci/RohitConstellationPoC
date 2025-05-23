import { io, Socket } from 'socket.io-client';
import { SessionParticipant, SessionState, SESSION_EVENT } from '@rohit-constellation/types';

// Add environment variable type declaration
declare global {
  interface ImportMeta {
    env: {
      VITE_WS_URL?: string;
      VITE_API_URL?: string;
    };
  }
}

// Add participant storage constants
const PARTICIPANT_STORAGE_KEY = 'session_participant';
const PARTICIPANT_EXPIRY = 60 * 60 * 1000; // 1 hour in milliseconds

interface StoredParticipant {
  id: string;
  sessionId: string;
  name: string;
  role: string;
  timestamp: number;
}

class WebSocketService {
  private socket: Socket | null = null;
  private sessionId: string | null = null;
  private isConnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;

  private getStoredParticipant(): StoredParticipant | null {
    const stored = localStorage.getItem(PARTICIPANT_STORAGE_KEY);
    if (!stored) return null;

    try {
      const participant = JSON.parse(stored) as StoredParticipant;
      // Check if the stored participant has expired
      if (Date.now() - participant.timestamp > PARTICIPANT_EXPIRY) {
        localStorage.removeItem(PARTICIPANT_STORAGE_KEY);
        return null;
      }
      return participant;
    } catch {
      localStorage.removeItem(PARTICIPANT_STORAGE_KEY);
      return null;
    }
  }

  private storeParticipant(participant: Omit<StoredParticipant, 'timestamp'>) {
    const storedParticipant: StoredParticipant = {
      ...participant,
      timestamp: Date.now()
    };
    localStorage.setItem(PARTICIPANT_STORAGE_KEY, JSON.stringify(storedParticipant));
  }

  connect(sessionId: string) {
    // If already connected to the same session, do nothing
    if (this.socket?.connected && this.sessionId === sessionId) {
      console.log('Socket already connected to session', sessionId);
      return;
    }

    // If connecting, wait
    if (this.isConnecting) {
      console.log('Connection in progress, skipping');
      return;
    }

    // If connected to a different session, disconnect first
    if (this.socket?.connected && this.sessionId !== sessionId) {
      console.log('Connected to different session, disconnecting first');
      this.disconnect();
    }

    this.isConnecting = true;
    this.sessionId = sessionId;
    const namespace = 'sessions';

    try {
      // Get stored participant info if available
      const storedParticipant = this.getStoredParticipant();
      
      const query: any = { sessionId };
      if (storedParticipant && storedParticipant.sessionId === sessionId) {
        query.participantId = storedParticipant.id;
        query.name = storedParticipant.name;
        query.role = storedParticipant.role;
      }

      this.socket = io(
        (import.meta.env.VITE_WS_URL || 'ws://localhost:3000/') + namespace,
        {
          query,
          reconnection: true,
          reconnectionAttempts: this.maxReconnectAttempts,
          reconnectionDelay: 1000,
          timeout: 5000
        }
      );

      this.socket.on('connect', () => {
        console.log('Connected to WebSocket server with ID:', this.socket?.id);
        this.isConnecting = false;
        this.reconnectAttempts = 0;
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error);
        this.isConnecting = false;
        this.reconnectAttempts++;
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error('Max reconnection attempts reached');
          this.disconnect();
        }
      });

      this.socket.on('disconnect', (reason) => {
        console.log('Disconnected from WebSocket server. Reason:', reason);
        this.isConnecting = false;
        
        // Only attempt reconnect if it wasn't a client-initiated disconnect
        if (reason !== 'io client disconnect') {
          this.reconnectAttempts++;
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            console.log('Attempting to reconnect...');
            this.connect(sessionId);
          }
        }
      });

      this.socket.on('error', (error: Error) => {
        console.error('WebSocket error:', error);
        this.isConnecting = false;
      });
    } catch (error) {
      console.error('Error creating socket connection:', error);
      this.isConnecting = false;
    }
  }

  disconnect() {
    if (this.socket) {
      // Remove all listeners before disconnecting
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      this.sessionId = null;
      this.isConnecting = false;
      this.reconnectAttempts = 0;
    }
  }

  // Session Events
  onSessionStateUpdate(callback: (state: SessionState) => void) {
    this.socket?.on(SESSION_EVENT.STATE, (data) => {
      console.log('Session state received:', data);
      callback(data);
    });
  }

  onQuestionReady(callback: (payload: { sessionId: string; participantId: string; question: any }) => void) {
    this.socket?.on(SESSION_EVENT.QUESTION_READY, (data) => {
      console.log('Question ready received:', data);
      callback(data);
    });
  }

  onParticipantJoined(callback: (participant: SessionParticipant) => void) {
    this.socket?.on(SESSION_EVENT.PARTICIPANT_JOINED, (data) => {
      console.log('Participant joined:', data);
      callback(data);
    });
  }

  onParticipantLeft(callback: (participantId: string) => void) {
    this.socket?.on(SESSION_EVENT.PARTICIPANT_LEFT, callback);
  }

  // Participant Actions
  joinSession(name: string, role: string, setParticipantId: (participantId: string) => void) {
    console.log('Attempting to join session with:', { name, role });
    this.socket?.emit(SESSION_EVENT.PARTICIPANT_JOINED, { name, role }, (response: any) => {
      console.log('Join session response:', response);
      if (response?.status === 'joined' && response?.participantId) {
        this.storeParticipant({
          id: response.participantId,
          sessionId: this.sessionId!,
          name,
          role
        });
        setParticipantId(response.participantId);
      }
    });
  }

  leaveSession(participantId: string) {
    console.log('Leaving session, clearing stored participant info');
    this.socket?.emit(SESSION_EVENT.LEAVE, { participantId });
    localStorage.removeItem(PARTICIPANT_STORAGE_KEY);
  }

  // Host Actions
  startSession() {
    if (!this.sessionId) return;
    this.socket?.emit(SESSION_EVENT.START, { sessionId: this.sessionId });
  }

  endSession() {
    if (!this.sessionId) return;
    this.socket?.emit(SESSION_EVENT.END, { sessionId: this.sessionId });
  }

  // Question Actions
  nextQuestion() {
    this.socket?.emit(SESSION_EVENT.QUESTION_NEXT);
  }

  submitAnswer(questionId: string, answer: any, participantId: string): Promise<{ status: string; answerId?: string; message?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        return reject(new Error('Socket not connected'));
      }
      this.socket.emit(SESSION_EVENT.QUESTION_ANSWER, { questionId, answer, participantId }, (response: { status: string; answerId?: string; message?: string }) => {
        if (response && response.status === 'received') {
          console.log('Answer submission acknowledged by server:', response);
          resolve(response);
        } else {
          console.error('Answer submission failed or not acknowledged properly:', response);
          reject(response || new Error('Answer submission failed'));
        }
      });
    });
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