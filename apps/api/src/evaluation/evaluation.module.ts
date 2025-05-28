import { Module } from '@nestjs/common';

import { LLMModule } from '../llm/llm.module';

import { EvaluationService } from './evaluation.service';

@Module({
  imports: [LLMModule],
  providers: [EvaluationService],
  exports: [EvaluationService],
})
export class EvaluationModule {} 