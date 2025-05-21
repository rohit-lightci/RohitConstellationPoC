import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateSessionDto } from './session.dto';
import { Session } from './session.entity';


@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
  ) {}

  async createSession(session: CreateSessionDto): Promise<Session> {
    return this.sessionRepository.save(session);
  }

  async getSession(id: string): Promise<Session> {
    return this.sessionRepository.findOne({ where: { id } });
  }
}