export interface CreateAnswerDto {
  sessionId: string;
  participantId: string;
  questionId: string;
  response: string | number;
} 