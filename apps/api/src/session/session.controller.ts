import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ParticipantStatus, SectionStatus, CreateSessionDto as TypesCreateSessionDto } from '@rohit-constellation/types';

import { SessionService } from './session.service';

@Controller('sessions')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post()
  createSession(@Body() createSessionDto: TypesCreateSessionDto) {
    console.log('Received session data for creation:', JSON.stringify(createSessionDto, null, 2));
    return this.sessionService.createSession(createSessionDto);
  }

  @Get(':id')
  getSession(@Param('id') id: string) {
    return this.sessionService.findOne(id);
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

  @Put(':sessionId/participants/:participantId/status')
  updateParticipantStatus(
    @Param('sessionId') sessionId: string,
    @Param('participantId') participantId: string,
    @Body() body: { status: ParticipantStatus }
  ) {
    return this.sessionService.updateParticipantStatus(
      sessionId,
      participantId,
      body.status
    );
  }

  @Put(':sessionId/sections/:sectionId/status')
  updateSectionStatus(
    @Param('sessionId') sessionId: string,
    @Param('sectionId') sectionId: string,
    @Body() body: { status: SectionStatus }
  ) {
    return this.sessionService.updateSectionStatus(
      sessionId,
      sectionId,
      body.status
    );
  }
} 