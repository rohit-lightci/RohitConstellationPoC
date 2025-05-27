import { Injectable, Logger } from '@nestjs/common';
import { Session, Participant, Question } from '@rohit-constellation/types';

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);
  private readonly MAKE_ANSWER_SUFFICIENT = false; // this will force the max limit 

  constructor() {}

  async evaluateAnswer(
    session: Session,
    participant: Participant,
    question: Question,
    response: string | number,
  ): Promise<{ isSufficient: boolean; feedback?: string; score?: number }> {
    this.logger.log(
      `Evaluating answer for P: ${participant.id} to Q: ${question.id} in S: ${session.id} (Response: ${response})`,
    );
    // Mock implementation: Randomly decide if sufficient, unless it's a follow-up.
    // If the question itself is a follow-up, consider the answer sufficient for now.
    if (question.intent === 'FOLLOW_UP') {
        return { isSufficient: this.MAKE_ANSWER_SUFFICIENT, feedback: 'Follow-up answer processed.' };
    }

    // For base questions, random sufficiency.
    const isSufficient = this.MAKE_ANSWER_SUFFICIENT ;//Math.random() > 0.5; 
    const feedback = isSufficient 
        ? 'Answer seems sufficient.' 
        : 'Answer may need more detail or a follow-up.';
    this.logger.log(`Evaluation result for P: ${participant.id}, Q: ${question.id}: ${isSufficient ? 'Sufficient' : 'Insufficient'}`);
    return { isSufficient, feedback };
  }
} 