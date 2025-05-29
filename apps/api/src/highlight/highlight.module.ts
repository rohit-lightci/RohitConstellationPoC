import { Module } from '@nestjs/common';

import { LLMModule } from '../llm/llm.module';

import { HighlightService } from './highlight.service';

@Module({
  imports: [LLMModule],
  providers: [HighlightService],
  exports: [HighlightService],
})
export class HighlightModule {} 