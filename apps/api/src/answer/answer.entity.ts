import { QuestionResponse } from '@rohit-constellation/types'; // For field reference, not direct implementation
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { Session } from '../session/session.entity';

@Entity('answers') // Specify table name if desired, otherwise defaults to 'answer'
export class Answer implements Omit<QuestionResponse, 'sessionId' | 'evaluation'> {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  questionId: string;

  @Column()
  participantId: string;

  @Column('text') // Assuming response can be long
  response: string | number; // TypeORM handles string | number by choosing a compatible type or you might need a transformer

  @CreateDateColumn()
  createdAt: Date;

  // Define the many-to-one relationship to Session
  @ManyToOne(() => Session, session => session.answers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' }) // Explicitly define the foreign key column name
  session: Session;

  // We can add the sessionId directly as a column if we prefer, 
  // but TypeORM can manage it via the relationship object 'session' and @JoinColumn.
  // For direct access, if needed:
  @Column()
  sessionId: string;
} 