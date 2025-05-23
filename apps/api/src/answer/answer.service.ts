import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateAnswerDto } from './answer.dto';
import { Answer } from './answer.entity';
// Import Session entity if needed for validation, but not strictly for creating an Answer if sessionId is passed.
// import { Session } from '../session/session.entity'; 

@Injectable()
export class AnswerService {
  constructor(
    @InjectRepository(Answer)
    private answerRepository: Repository<Answer>,
    // @InjectRepository(Session) // If we need to fetch/validate Session here
    // private sessionRepository: Repository<Session>,
  ) {}

  async create(createAnswerDto: CreateAnswerDto): Promise<Answer> {
    const { sessionId, participantId, questionId, response } = createAnswerDto;

    // Optional: Validate if session, participant, and question exist before creating an answer.
    // This would require fetching the session and checking its internal structure.
    // For now, we assume these IDs are valid as per the current design of SessionService handling that.

    const newAnswer = this.answerRepository.create({
      sessionId,
      participantId,
      questionId,
      response,
    });

    return this.answerRepository.save(newAnswer);
  }

  // We might add other methods here later, e.g., findBySession, findByParticipant, etc.
} 