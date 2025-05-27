import { Module, forwardRef } from '@nestjs/common';

import { EvaluationModule } from '../evaluation/evaluation.module';
import { SessionModule } from '../session/session.module';
import { SessionCacheModule } from '../session-cache/session-cache.module';

import { OrchestratorService } from './orchestrator.service';

@Module({
  imports: [
    SessionCacheModule,
    EvaluationModule,
    forwardRef(() => SessionModule),
  ],
  providers: [OrchestratorService],
  exports: [OrchestratorService],
})
export class OrchestratorModule {} 