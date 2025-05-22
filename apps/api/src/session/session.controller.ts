import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { CreateSessionDto } from './session.dto';
import { SessionService } from './session.service';

@Controller('sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post()
  createSession(@Body() createSessionDto: CreateSessionDto) {
    console.log('Received session data:', JSON.stringify(createSessionDto, null, 2));
    return this.sessionService.createSession(createSessionDto);
  }

  @Get(':id')
  getSession(@Param('id') id: string) {
    return this.sessionService.getSession(id);
  }

  @Post(':id/activate')
  activateSession(@Param('id') id: string) {
    return this.sessionService.activateSession(id);
  }

  @Post(':id/participants')
  addParticipant(
    @Param('id') id: string,
    @Body() body: { name: string }
  ) {
    return this.sessionService.addParticipant(id, body.name);
  }
} 