export type SessionType = 'RETRO';
export type SessionStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED';
export type ParticipantStatus = 'ACTIVE' | 'INACTIVE' | 'COMPLETED';
export type SectionType = 'MAD' | 'SAD' | 'GLAD';
export type SectionStatus = 'PENDING' | 'ACTIVE' | 'COMPLETED';
export type QuestionType = 'TEXT' | 'RATING' | 'MULTIPLE_CHOICE' | 'AGREE_DISAGREE';

export interface Session {
  id: string;
  title: string;
  type: SessionType;
  status: SessionStatus;
  globalTimeLimit: number;  // in minutes
  createdAt: Date;
  expiresAt: Date;
  createdBy: string;  // admin idz
  isAnonymous: boolean;
  participants: Participant[];
  sections: Section[];
}

export interface Participant {
  id: string;
  name: string;
  role: 'PARTICIPANT';
  status: ParticipantStatus;
  currentSection: string;  // section id
  currentQuestion: string;  // question id
  joinedAt: Date;
  completedAt?: Date;
}

export interface Section {
  id: string;
  type: SectionType;
  timeLimit: number;  // 10 minutes
  status: SectionStatus;
  questions: Question[];
  startedAt?: Date;
  completedAt?: Date;
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  sectionId: string;
  order: number;
  isBaseQuestion: boolean;
  parentQuestionId?: string;  // for follow-up questions
  options?: string[];  // for multiple choice
  minRating?: number;  // for rating questions
  maxRating?: number;  // for rating questions
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
  description: string;
  title: string;
  type: SessionType;
  globalTimeLimit: number;
  expiresAt: Date;
  isAnonymous: boolean;
  participationRule: string;
  createdBy: string;
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
export interface SessionEvents {
  'question:ready': {
    sessionId: string;
    participantId: string;
    question: Question;
  };
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
  'session:status': {
    sessionId: string;
    status: SessionStatus;
  };
} 