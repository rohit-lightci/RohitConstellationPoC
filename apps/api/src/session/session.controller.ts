import { Body, Controller, Post } from '@nestjs/common';

import { CreateSessionDto } from './session.dto';
import { SessionService } from './session.service';

@Controller('sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post('/create')
  createSession(@Body() createSessionDto: CreateSessionDto) {
    console.log('Received session data:', JSON.stringify(createSessionDto, null, 2));
    return this.sessionService.createSession(createSessionDto);
  }
} 