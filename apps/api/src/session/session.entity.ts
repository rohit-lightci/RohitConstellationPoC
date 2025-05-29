import { Participant, Section, SessionStatus, SessionType as ConstellationSessionType } from '@rohit-constellation/types';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany, VersionColumn } from 'typeorm';

import { Answer } from '../answer/answer.entity';

@Entity()
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @VersionColumn()
  version: number;

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
  type: ConstellationSessionType;

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
  permissions: {
    askQuestions: boolean;
    reactUpvote: boolean;
    seeResponses: boolean;
  };

  @Column('jsonb', { default: [] })
  participants: Participant[];

  @Column('jsonb', { default: [] })
  sections: Section[];

  @OneToMany(() => Answer, answer => answer.session, { cascade: true, eager: false })
  answers: Answer[];

  @Column({ type: 'text', nullable: true })
  generatedReportJson?: string;
}
