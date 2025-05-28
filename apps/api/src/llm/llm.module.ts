import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { LLMService } from './llm.service';

@Module({
  imports: [ConfigModule], // Import ConfigModule here
  providers: [LLMService],
  exports: [LLMService],
})
export class LLMModule {} 