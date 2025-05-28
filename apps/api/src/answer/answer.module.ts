import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EmbeddingModule } from '../embedding/embedding.module';

import { Answer } from './answer.entity';
import { AnswerService } from './answer.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Answer]),
    EmbeddingModule,
  ],
  providers: [AnswerService],
  exports: [AnswerService], // Export AnswerService if SessionService will use it
})
export class AnswerModule {}  