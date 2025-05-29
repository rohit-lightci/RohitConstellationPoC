import { Answer } from '../answer/answer.entity';
import { Session } from '../session/session.entity';

export interface SessionReportSection {
  sectionId: string;
  sectionTitle: string; 
  highlights: string[]; 
}

export interface SessionReportActionItem {
  description: string;
  // assignedTo?: string; 
}

export interface SessionReport {
  sessionId: string;
  sessionTitle: string;
  overallSummary?: string;
  sections: SessionReportSection[];
  actionItems: SessionReportActionItem[];
}

// Data that the HighlightService will need to generate a report
export interface ReportGenerationData {
  session: Session; 
  answers: Answer[];
} 