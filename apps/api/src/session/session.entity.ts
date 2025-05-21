import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

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

  @Column()
  duration: number;

  @Column()
  anonymous: boolean;

  @Column()
  participationRule: string;

  @Column('jsonb')
  permissions: { // participant permissions
    askQuestions: boolean;
    reactUpvote: boolean;
    seeResponses: boolean;
  };
}
