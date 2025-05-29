export type SessionType = 'RETRO';
export type SessionStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED';
export type ParticipantStatus = 'ACTIVE' | 'INACTIVE' | 'COMPLETED';
export type SectionType = 'MAD' | 'SAD' | 'GLAD' | 'CUSTOM';
export type SectionStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED';
export type QuestionType = 'TEXT' | 'RATING' | 'MULTIPLE_CHOICE' | 'AGREE_DISAGREE';
export type QuestionIntent = 'BASE' | 'FOLLOW_UP' | 'CROSS_POLLINATION';


export interface Session {
  id: string;
  version: number;
  template: string;
  title: string;
  description?: string;
  type: SessionType;
  status: SessionStatus;
  globalTimeLimit: number;  // in minutes
  createdAt: Date;
  expiresAt: Date;
  createdBy: string;  // admin id
  isAnonymous: boolean;
  participationRule: string;
  permissions: {
    askQuestions: boolean;
    reactUpvote: boolean;
    seeResponses: boolean;
  };
  participants: Participant[];
  sections: Section[];
}

export interface Participant {
  id: string;
  name: string;
  role: 'PARTICIPANT' | 'HOST';
  status: ParticipantStatus;
  currentSection: string;  // section id
  currentQuestion: string;  // question id
  joinedAt: Date;
  completedAt?: Date;
}

export interface Section {
  id: string;
  name: string;
  type: SectionType;
  order: number;
  timeLimit: number;  // 10 minutes
  status: SectionStatus;
  questions: Question[];
  startedAt?: Date;
  completedAt?: Date;
  goal?: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  sectionId: string;
  order: number;
  parentQuestionId?: string;  // for follow-up questions
  generatedForParticipantId?: string;
  options?: string[];  // for multiple choice
  minRating?: number;  // for rating questions
  maxRating?: number;  // for rating questions
  intent: QuestionIntent;
  goal?: string;
}

export interface QuestionResponse {
  id: string;
  questionId: string;
  participantId: string;
  sessionId: string;
  response: string | number;  // based on question type
  createdAt: Date;
  evaluation?: {
    isSufficient: boolean;
    score?: number;
    feedback?: string;
  };
}

// DTOs for creating/updating sessions
export interface CreateSessionDto {
  template: string;
  title: string;
  description?: string;
  type: SessionType;
  globalTimeLimit: number;
  expiresAt: Date;
  createdBy: string;
  isAnonymous: boolean;
  participationRule: string;
  permissions: {
    askQuestions: boolean;
    reactUpvote: boolean;
    seeResponses: boolean;
  };
}

export interface AddParticipantDto {
  name: string;
  sessionId: string;
}

export interface SubmitResponseDto {
  sessionId: string;
  participantId: string;
  questionId: string;
  response: string | number;
}

// Progress tracking interfaces
export interface SessionProgress {
  sessionId: string;
  status: SessionStatus;
  activeParticipants: number;
  completedParticipants: number;
  currentSection: SectionType;
  sectionProgress: {
    [key in SectionType]: {
      status: SectionStatus;
      completedParticipants: number;
      totalParticipants: number;
    };
  };
}

export interface ParticipantProgress {
  participantId: string;
  sessionId: string;
  status: ParticipantStatus;
  currentSection: SectionType;
  completedQuestions: number;
  totalQuestions: number;
  sectionProgress: {
    [key in SectionType]: {
      status: SectionStatus;
      completedQuestions: number;
      totalQuestions: number;
    };
  };
}

// WebSocket event types
export interface SessionParticipant {
  id: string;
  name: string;
  role: string;
  isHost: boolean;
  status?: ParticipantStatus;
}

export interface SessionState {
  id: string;
  status: SessionStatus;
  participants: SessionParticipant[];
  currentQuestion?: {
    id: string;
    text: string;
    type: string;
  };
}

export interface QuestionReadyEvent {
  sessionId: string;
  participantId: string;
  question: Question;
}

export interface SessionEvents {
  'question:ready': QuestionReadyEvent;
  'participant:status': {
    sessionId: string;
    participantId: string;
    status: ParticipantStatus;
  };
  'section:status': {
    sessionId: string;
    sectionId: string;
    status: SectionStatus;
  };
  'session:participant:all_questions_completed': {
    sessionId: string;
    participantId: string;
  };
}

export const SESSION_EVENT = {
  START: 'session:start',
  PARTICIPANT_STATUS: 'participant:status',
  PARTICIPANT_JOINED: 'session:participant:joined',
  PARTICIPANT_LEFT: 'session:participant:left',
  SECTION_STATUS: 'section:status',
  STATE: 'session:state',
  LEAVE: 'session:leave',
  END: 'session:end',
  QUESTION_READY: 'question:ready',
  QUESTION_NEXT: 'session:question:next',
  QUESTION_ANSWER: 'session:question:answer',
  GET_QUESTION: 'session:get:question',
  ALL_QUESTIONS_COMPLETED: 'session:participant:all_questions_completed',
  ERROR: 'session:error',
  // Add more as needed
} as const;

export type SessionEventName = typeof SESSION_EVENT[keyof typeof SESSION_EVENT]; 