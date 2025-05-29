import { SessionType } from '@rohit-constellation/types';
import { IsString, IsNumber, IsBoolean, IsDate, IsObject, IsOptional } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  template: string;
  
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  customPrompt?: string;

  @IsString()
  type: SessionType = 'RETRO';  // For now, only RETRO is supported

  @IsOptional()
  @IsString()
  description?: string;
  
  @IsNumber()
  globalTimeLimit: number;  // in minutes

  @IsDate()
  expiresAt?: Date;

  @IsString()
  createdBy: string;  // admin id

  @IsBoolean()
  isAnonymous: boolean;

  @IsString()
  participationRule: string;

  @IsObject()
  permissions: {
    askQuestions: boolean;
    reactUpvote: boolean;
    seeResponses: boolean;
  };
} 