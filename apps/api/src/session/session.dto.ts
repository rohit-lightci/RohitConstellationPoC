import { IsString, IsOptional, IsNumber, IsBoolean, IsObject } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  template: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  duration: number;

  @IsBoolean()
  anonymous: boolean;

  @IsString()
  participationRule: string;

  @IsObject()
  permissions: {
    askQuestions: boolean;
    reactUpvote: boolean;
    seeResponses: boolean;
  };
} 