import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Answer } from '../answer/answer.entity';
import { AnswerModule } from '../answer/answer.module';
import { HighlightModule } from '../highlight/highlight.module';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';

import { SessionEventsService } from './session-events.service';
import { SessionController } from './session.controller';
import { Session } from './session.entity';
import { SessionGateway } from './session.gateway';
import { SessionService } from './session.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Session, Answer]),
    AnswerModule,
    HighlightModule,
    forwardRef(() => OrchestratorModule),
  ],
  controllers: [SessionController],
  providers: [SessionService, SessionGateway, SessionEventsService],
  exports: [SessionService, SessionEventsService]
})
export class SessionModule {} 