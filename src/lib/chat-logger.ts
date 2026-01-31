import { query } from "./db";

export interface ChatLogEntry {
  sessionId: string;
  userId?: string;
  interactionIndex: number;
  userMessage: string;
  userMessageTimestamp: Date;
  aiResponse?: string;
  aiResponseTimestamp?: Date;
  responseComplete: boolean;
  toolsCalled?: Array<{ name: string; args: any; timestamp: Date }>;
  toolResults?: Array<{
    name: string;
    result: any;
    success: boolean;
    timestamp: Date;
  }>;
  totalDurationMs?: number;
  llmCalls: number;
  errorOccurred: boolean;
  errorMessage?: string;
  modelName: string;
}

export async function logChatInteraction(
  entry: ChatLogEntry
): Promise<void> {
  try {
    await query(
      `
      INSERT INTO ai_chat_logs (
        session_id, user_id, interaction_index,
        user_message, user_message_timestamp,
        ai_response, ai_response_timestamp, response_complete,
        tools_called, tool_results,
        total_duration_ms, llm_calls,
        error_occurred, error_message,
        model_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    `,
      [
        entry.sessionId,
        entry.userId || null,
        entry.interactionIndex,
        entry.userMessage,
        entry.userMessageTimestamp,
        entry.aiResponse || null,
        entry.aiResponseTimestamp || null,
        entry.responseComplete,
        entry.toolsCalled ? JSON.stringify(entry.toolsCalled) : null,
        entry.toolResults ? JSON.stringify(entry.toolResults) : null,
        entry.totalDurationMs || null,
        entry.llmCalls,
        entry.errorOccurred,
        entry.errorMessage || null,
        entry.modelName,
      ]
    );
  } catch (error) {
    // Log the error but don't throw - we don't want logging failures to break the chat
    console.error("Failed to log chat interaction:", error);
  }
}
