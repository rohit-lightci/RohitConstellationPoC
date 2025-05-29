import { Module } from '@nestjs/common';

import { LLMModule } from '../llm/llm.module';

import { PromptContentGenerationService } from './prompt-content-generation.service';

@Module({
  imports: [LLMModule],
  providers: [PromptContentGenerationService],
  exports: [PromptContentGenerationService],
})
export class PromptContentGenerationModule {}
