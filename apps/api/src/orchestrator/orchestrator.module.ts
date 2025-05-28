import { Module, forwardRef } from '@nestjs/common';

import { AnswerModule } from '../answer/answer.module';
import { EvaluationModule } from '../evaluation/evaluation.module';
import { SessionModule } from '../session/session.module';
import { SessionCacheModule } from '../session-cache/session-cache.module';

import { OrchestratorService } from './orchestrator.service';

@Module({
  imports: [
    SessionCacheModule,
    EvaluationModule,
    forwardRef(() => SessionModule),
    AnswerModule,
  ],
  providers: [OrchestratorService],
  exports: [OrchestratorService],
})
export class OrchestratorModule {} 