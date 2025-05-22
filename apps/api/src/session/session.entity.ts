import { ParticipantStatus, QuestionType, SectionStatus, SectionType, SessionStatus, SessionType } from '@rohit-constellation/types';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column()
  template: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: ['RETRO'],
    default: 'RETRO'
  })
  type: SessionType;

  @Column({
    type: 'enum',
    enum: ['DRAFT', 'ACTIVE', 'COMPLETED'],
    default: 'DRAFT'
  })
  status: SessionStatus;

  @Column()
  globalTimeLimit: number;  // in minutes

  @CreateDateColumn()
  createdAt: Date;

  @Column()
  expiresAt: Date;

  @Column()
  createdBy: string;  // admin id

  @Column()
  isAnonymous: boolean;

  @Column()
  participationRule: string;
  

  @Column('jsonb')
  permissions: { // participant permissions
    askQuestions: boolean;
    reactUpvote: boolean;
    seeResponses: boolean;
  };

  @Column('jsonb', { default: [] })
  participants: {
    id: string;
    name: string;
    role: 'PARTICIPANT';
    status: ParticipantStatus;
    currentSection: string;
    currentQuestion: string;
    joinedAt: Date;
    completedAt?: Date;
  }[];

  @Column('jsonb', { default: [] })
  sections: {
    id: string;
    type: SectionType;
    timeLimit: number;
    status: SectionStatus;
    questions: {
      id: string;
      type: QuestionType;
      text: string;
      sectionId: string;
      order: number;
      isBaseQuestion: boolean;
      parentQuestionId?: string;
      options?: string[];
      minRating?: number;
      maxRating?: number;
    }[];
    startedAt?: Date;
    completedAt?: Date;
  }[];
}
