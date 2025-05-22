import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SessionEventsService } from './session-events.service';
import { SessionController } from './session.controller';
import { Session } from './session.entity';
import { SessionGateway } from './session.gateway';
import { SessionService } from './session.service';

@Module({
  imports: [TypeOrmModule.forFeature([Session])],
  controllers: [SessionController],
  providers: [SessionService, SessionGateway, SessionEventsService],
})
export class SessionModule {} 