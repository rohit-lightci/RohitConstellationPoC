import { Module, forwardRef } from '@nestjs/common';

import { AnswerModule } from '../answer/answer.module';
import { EvaluationModule } from '../evaluation/evaluation.module';
import { LLMModule } from '../llm/llm.module';
import { SessionModule } from '../session/session.module';
import { SessionCacheModule } from '../session-cache/session-cache.module';

import { OrchestratorService } from './orchestrator.service';

@Module({
  imports: [
    AnswerModule,
    EvaluationModule,
    LLMModule,
    forwardRef(() => SessionModule),
    SessionCacheModule,
  ],
  providers: [OrchestratorService],
  exports: [OrchestratorService],
})
export class OrchestratorModule {} 