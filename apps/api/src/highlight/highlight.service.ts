import {Injectable, Logger} from "@nestjs/common";
import OpenAI from "openai";

import {Answer} from "../answer/answer.entity";
import {LLMService} from "../llm/llm.service";
import {Session} from "../session/session.entity";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import {ReportGenerationData, SessionReport, SessionReportActionItem, SessionReportSection} from "./highlight.types";

@Injectable()
export class HighlightService {
    private readonly logger = new Logger(HighlightService.name);

    constructor(private readonly llmService: LLMService) {}

    private buildContextForLLM(reportData: ReportGenerationData): string {
        let context = `Session Title: ${reportData.session.title}\\n`;
        if (reportData.session.description) {
            context += `Session Description: ${reportData.session.description}\\n`;
        }
        context += "\\nTranscript:\\n";

        const sessionSections = reportData.session.sections;
        const sessionAnswers = reportData.answers;

        for (const section of sessionSections) {
            context += `\\n---\\nSection ID: ${section.id}\\nSection Name: ${section.name}\\nSection Type: ${section.type}\\n(Goal: ${section.goal || "N/A"})\\n`;
            const questionsInSection = section.questions;
            for (const question of questionsInSection) {
                context += `  Question: ${question.text}\\n`;
                const answersToQuestion = sessionAnswers.filter((ans) => ans.questionId === question.id);
                if (answersToQuestion.length > 0) {
                    for (const answer of answersToQuestion) {
                        const participant = reportData.session.participants.find((p) => p.id === answer.participantId);
                        const participantIdentifier = participant
                            ? `Participant (Role: ${participant.role})`
                            : "Unknown Participant";
                        context += `    ${participantIdentifier} answered: ${answer.response}\\n`;
                    }
                } else {
                    context += "    (No responses to this question)\\n";
                }
            }
        }
        context += "---\\n";
        return context;
    }

    async generateReport(reportData: {session: Session; answers: Answer[]}): Promise<SessionReport | null> {
        this.logger.log(`Generating report for session: ${reportData.session.id}`);

        const transcriptContext = this.buildContextForLLM(reportData);

        const systemPrompt = `You are an expert AI assistant. Your task is to analyze a session transcript and generate a concise report. The report should include key highlights for each session section and a list of actionable items. Your response MUST be a valid JSON object that strictly conforms to the TypeScript interface SessionReport provided below. Do NOT include any explanatory text or markdown formatting before or after the JSON object.\\n\\n    Interface Definition:\\n    \\\`\\\`\\\`typescript\\n    interface SessionReportSection {\\n      sectionId: string; // The actual ID (e.g., UUID) of the section from the transcript (use the value of 'Section ID')\\n      sectionTitle: string; // The descriptive name of the section from the transcript (use the value of 'Section Name'). For predefined types like 'MAD', 'GLAD', if 'Section Name' is generic, you can use the 'Section Type' as a fallback.\\n      highlights: string[]; // Array of 2-4 concise highlight strings for this section based on participant answers\\n    }\\n\\n    interface SessionReportActionItem {\\n      description: string; // A specific, actionable task derived from the discussion\\n    }\\n\\n    export interface SessionReport {\\n      sessionId: string; // The ID of the session\\n      sessionTitle: string; // The title of the session\\n      overallSummary?: string; // Optional: A brief 1-2 sentence summary of the entire session\\n      sections: SessionReportSection[]; // Array of report sections\\n      actionItems: SessionReportActionItem[]; // Array of action items\\n    }\\n    \\\`\\\`\\\`\\n    `;

        const userPrompt = `Please analyze the following session transcript and generate the report as a JSON object according to the SessionReport interface provided in the system prompt.\\n\\n    Session ID: ${reportData.session.id}\\n    Session Title: ${reportData.session.title}\\n\\n    ${transcriptContext}\\n\\n    Ensure 'sectionId' in your JSON output matches the 'Section ID' (UUID) from the transcript, and 'sectionTitle' matches the 'Section Name' from the transcript for each section.\\n    Generate the JSON object now.`;

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            {role: "system", content: systemPrompt},
            {role: "user", content: userPrompt},
        ];

        let llmResponseForDebug: string | undefined = undefined;

        try {
            const llmResponse = await this.llmService.generateChatCompletion(
                messages,
                undefined, // model
                0.3 // temperature - aiming for factual, less creative
            );
            llmResponseForDebug = llmResponse;

            if (!llmResponse) {
                this.logger.warn(`LLM returned empty response for session report: ${reportData.session.id}`);
                return null;
            }

            let jsonString = llmResponse;
            const jsonRegex = /```json\n([\s\S]*?)\n```/i;
            const match = jsonString.match(jsonRegex);
            if (match && match[1]) {
                jsonString = match[1];
            } else if (jsonString.startsWith("```json")) {
                jsonString = jsonString.substring(7);
                if (jsonString.endsWith("```")) {
                    jsonString = jsonString.substring(0, jsonString.length - 3);
                }
            } else if (jsonString.startsWith("```")) {
                jsonString = jsonString.substring(3);
                if (jsonString.endsWith("```")) {
                    jsonString = jsonString.substring(0, jsonString.length - 3);
                }
            }
            jsonString = jsonString.trim();

            const report = JSON.parse(jsonString) as SessionReport;

            if (
                report &&
                report.sessionId === reportData.session.id &&
                Array.isArray(report.sections) &&
                Array.isArray(report.actionItems) &&
                report.sections.every(
                    (s) =>
                        typeof s.sectionId === "string" &&
                        typeof s.sectionTitle === "string" &&
                        Array.isArray(s.highlights)
                ) &&
                report.actionItems.every((ai) => typeof ai.description === "string")
            ) {
                this.logger.log(`Successfully generated and parsed report for session: ${reportData.session.id}`);
                return report;
            } else {
                this.logger.error(
                    `Generated report for session ${reportData.session.id} failed validation or parsing. Raw LLM string: ${llmResponse} Parsed structure: ${JSON.stringify(report)}`
                );
                return null;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(
                `Error generating report for session ${reportData.session.id}: ${errorMessage}`,
                error instanceof Error ? error.stack : undefined
            );
            this.logger.debug(
                `Problematic LLM input was: ${JSON.stringify(messages)}. Problematic LLM response string for S:${reportData.session.id}: ${llmResponseForDebug || "NO RESPONSE CAPTURED / LLM CALL FAILED"}`
            );
            return null;
        }
    }
}
