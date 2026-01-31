import { tools, executeTool } from "@/lib/chat-tools";
import { logChatInteraction } from "@/lib/chat-logger";
import { getSession } from "@/lib/auth";

// Azure AI Foundry configuration
function getEndpoint() {
  return (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/$/, "");
}
function getApiKey() {
  return process.env.AZURE_OPENAI_API_KEY || "";
}
function getApiVersion() {
  return process.env.AZURE_OPENAI_API_VERSION || "2024-05-01-preview";
}
function getModelName() {
  return process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-5";
}

// System prompt with database schema and application context
const SYSTEM_PROMPT = `You are a concise AI assistant for the UN Secretary-General Reports Survey.

## Tools
1. **read_document(symbol)** - Fetch UN document text (e.g., A/78/123, A/RES/78/1)
2. **query_database(query, explanation)** - Read-only SQL on reports database

## Database Tables

### Main Tables
- **documents**: symbol, proper_title, title, un_body (TEXT), publication_date (TEXT), text, word_count, subject_terms[], based_on_resolution_symbols[]
- **sg_reports**: SG reports 2023+ (same columns as documents, pre-filtered view)
- **latest_versions**: Most recent version per report series. Columns: symbol, proper_title, title, un_body, publication_date, effective_year (INT), entity, subject_terms[], version_count

### Survey Tables
- **survey_responses**: proper_title, user_entity, status, frequency, format, merge_targets[], comments
- **report_frequencies**: proper_title, calculated_frequency ('annual'|'biennial'|'triennial'|'quadrennial'|'one-time'), gap_history[], year_count

### Resolution Views & Tables
- **resolutions**: Resolution documents in database (only those referenced by reports, not all UN resolutions)
- **sg_report_mandates**: Links reports to mandating resolutions. Columns: report_symbol, report_title, resolution_symbol, resolution_title, resolution_year
- **resolution_mandates**: AI-extracted mandate info. Columns: resolution_symbol, verbatim_paragraph, summary, explicit_frequency, implicit_frequency, frequency_reasoning

### Vector Search
- Documents have **embedding vector(1024)** column (text-embedding-3-large)
- Use pgvector's **<=>** operator for cosine distance
- Lower distance = more similar. Convert to similarity: \`1 - (embedding <=> source_embedding)\`
- To round similarity scores, cast to numeric first: \`ROUND((1 - distance)::numeric, 2)\`

## Response Style
- **Be brief**: 2-3 sentences max for simple questions. Bullet points for lists.
- **Use markdown**: Headers (##), bullets, tables, \`code\` for symbols
- **Summarize first**: Key findings upfront, details only if asked
- **Tables for data**: Always use markdown tables for query results
- **Compare concisely**: When comparing docs, use a table with key differences

## SQL Tips - IMPORTANT
- **Date handling**: publication_date is TEXT (e.g., '2024-03-15'). Use \`SUBSTRING(publication_date, 1, 4)\` for year extraction, NOT EXTRACT().
- **Use latest_versions for year queries**: It has \`effective_year\` (INT) pre-computed, e.g., \`WHERE effective_year = 2024\`
- **date_year column is often NULL** - avoid using it directly. Use publication_date or effective_year instead.
- **un_body is TEXT, not array** - use \`un_body ILIKE '%General Assembly%'\`, not ANY()
- **subject_terms is TEXT[]** - use \`'term' = ANY(subject_terms)\` or \`subject_terms @> ARRAY['term']\`
- **For frequency data**: Use report_frequencies table with calculated_frequency column

## SQL Examples
\`\`\`sql
-- Count reports by year (use effective_year from latest_versions)
SELECT effective_year, COUNT(*) FROM latest_versions GROUP BY effective_year ORDER BY effective_year;

-- Find reports by topic using subject_terms array
SELECT symbol, title FROM sg_reports WHERE 'CLIMATE CHANGE' = ANY(subject_terms);

-- Find annual reports using report_frequencies
SELECT rf.proper_title, lv.symbol FROM report_frequencies rf
JOIN latest_versions lv ON rf.proper_title = lv.proper_title
WHERE rf.calculated_frequency = 'annual';

-- Search by year using publication_date (TEXT)
SELECT * FROM sg_reports WHERE SUBSTRING(publication_date, 1, 4) = '2024';

-- Find semantically similar reports using vector search
WITH source AS (
  SELECT d.embedding
  FROM documents d
  WHERE d.symbol = 'A/78/123' AND d.embedding IS NOT NULL
)
SELECT 
  lv.symbol,
  lv.proper_title,
  lv.effective_year,
  1 - (lv.embedding <=> s.embedding) as similarity
FROM latest_versions lv
CROSS JOIN source s
WHERE lv.embedding IS NOT NULL
  AND lv.symbol != 'A/78/123'
ORDER BY lv.embedding <=> s.embedding
LIMIT 5;

-- Find resolutions that mandate a specific report
SELECT rm.resolution_symbol, rm.resolution_title, rm.resolution_year
FROM sg_report_mandates rm
WHERE rm.report_symbol = 'A/78/123';

-- Or use the array directly
SELECT symbol, proper_title, based_on_resolution_symbols
FROM documents
WHERE symbol = 'A/78/123' AND based_on_resolution_symbols IS NOT NULL;

-- Find all reports mandated by a resolution
SELECT rm.report_symbol, rm.report_title, rm.report_year
FROM sg_report_mandates rm
WHERE rm.resolution_symbol = 'A/RES/78/1';

-- Get AI-extracted mandate details (supplementary - prefer read_document for accuracy)
SELECT resolution_symbol, summary, explicit_frequency, verbatim_paragraph
FROM resolution_mandates
WHERE resolution_symbol = 'A/RES/78/1';
\`\`\`

## Common Tasks
- **Summarize a report**: Use read_document to get full text, then summarize key points
- **Compare reports/versions**: ALWAYS use read_document on BOTH documents to compare actual content, not just SQL metadata. Present differences in a table.
- **Find similar reports**: Use vector search query with \`<=>\` operator to find semantically similar reports based on content embeddings (not just metadata)
- **Find mandating resolutions**: 
  1. Query sg_report_mandates view OR documents.based_on_resolution_symbols array
  2. Optionally join with resolution_mandates for extracted mandate paragraphs and frequency analysis
  3. Use read_document on resolution symbols to read the full resolution text (often more reliable than resolution_mandates table)
  4. Note: Database only contains resolutions that are referenced by reports, not all UN resolutions
- **Find reports by topic**: Query with subject_terms or title ILIKE

## Important: Content vs Metadata
- SQL queries only return metadata (title, date, symbol, subject_terms)
- To analyze or compare actual report CONTENT, you MUST use read_document
- When user asks to "compare", "summarize", "what does it say", or "differences" → read the document(s)

## Multi-Step Workflows
You can chain multiple tool calls in sequence. Examples:
- Query SQL to find relevant reports → read_document on top results → summarize findings
- Read a report → query SQL to find related reports → read those too → compare
- Query for reports by topic → read several → synthesize insights across them
Don't hesitate to make multiple tool calls to fully answer the user's question.`;

// Message types
interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

// Request body type
interface ChatRequest {
  messages: ChatMessage[];
  initialPrompt?: string;
  sessionId?: string;
  interactionIndex?: number;
  // Note: userId is extracted server-side from session cookie, not from request body
}

// SSE event types
type SSEEvent =
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: unknown; success: boolean }
  | { type: "text_delta"; content: string }
  | { type: "done" }
  | { type: "error"; message: string };

// Helper to send SSE events
function sendEvent(
  controller: ReadableStreamDefaultController,
  event: SSEEvent
) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}

// Call Azure AI Foundry Models API with streaming
async function* streamChatCompletion(messages: ChatMessage[]) {
  const endpoint = getEndpoint();
  const apiKey = getApiKey();
  const apiVersion = getApiVersion();
  const modelName = getModelName();
  const url = `${endpoint}/models/chat/completions?api-version=${apiVersion}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      model: modelName,
      messages,
      tools,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data);
          yield parsed;
        } catch {
          // Skip invalid JSON
        }
      }
    }
  }
}

export async function POST(request: Request) {
  try {
    const body: ChatRequest = await request.json();
    let { messages } = body;
    const { initialPrompt, sessionId, interactionIndex } = body;

    // Get userId from session cookie (server-side auth)
    const session = await getSession();
    const userId = session?.userId || undefined;

    // If there's an initial prompt (from URL params), add it as first user message
    if (initialPrompt && messages.length === 0) {
      messages = [{ role: "user", content: initialPrompt }];
    }

    // Extract user message for logging
    const userMessage = messages[messages.length - 1]?.content || initialPrompt || "";

    // Create the response stream
    const stream = new ReadableStream({
      async start(controller) {
        // Logging state
        const startTime = Date.now();
        const userMessageTimestamp = new Date();
        let fullAiResponse = "";
        let aiResponseTimestamp: Date | undefined;
        const toolsCalledLog: Array<{ name: string; args: any; timestamp: Date }> = [];
        const toolResultsLog: Array<{ name: string; result: any; success: boolean; timestamp: Date }> = [];
        let llmCallCount = 0;
        let errorOccurred = false;
        let errorMessage: string | undefined;

        try {
          // Prepare messages with system prompt
          const apiMessages: ChatMessage[] = [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages,
          ];

          // Agentic loop - continue until we get a final text response
          let iterations = 0;
          const maxIterations = 10; // Safety limit

          while (iterations < maxIterations) {
            iterations++;
            llmCallCount++;

            // Collect the streamed response
            let assistantContent = "";
            let toolCalls: Array<{
              id: string;
              type: "function";
              function: { name: string; arguments: string };
            }> = [];

            // Track tool call argument building
            const toolCallArgs: Map<number, string> = new Map();

            for await (const chunk of streamChatCompletion(apiMessages)) {
              const delta = chunk.choices?.[0]?.delta;

              // Handle text content
              if (delta?.content) {
                assistantContent += delta.content;
                fullAiResponse += delta.content;
                sendEvent(controller, { type: "text_delta", content: delta.content });
              }

              // Handle tool calls
              if (delta?.tool_calls) {
                for (const toolCallDelta of delta.tool_calls) {
                  const index = toolCallDelta.index;

                  // Initialize tool call if new
                  if (toolCallDelta.id) {
                    toolCalls[index] = {
                      id: toolCallDelta.id,
                      type: "function",
                      function: {
                        name: toolCallDelta.function?.name || "",
                        arguments: "",
                      },
                    };
                    toolCallArgs.set(index, "");
                  } else if (toolCalls[index]) {
                    // Only set function name if not already set
                    if (toolCallDelta.function?.name && !toolCalls[index].function.name) {
                      toolCalls[index].function.name = toolCallDelta.function.name;
                    }
                  }

                  // Accumulate arguments (these do come in chunks)
                  if (toolCallDelta.function?.arguments) {
                    const current = toolCallArgs.get(index) || "";
                    toolCallArgs.set(index, current + toolCallDelta.function.arguments);
                  }
                }
              }
            }

            // Finalize tool call arguments
            for (const [index, args] of toolCallArgs) {
              if (toolCalls[index]) {
                toolCalls[index].function.arguments = args;
              }
            }

            // Filter out any undefined entries
            toolCalls = toolCalls.filter(Boolean);

            // If no tool calls, we're done
            if (toolCalls.length === 0) {
              aiResponseTimestamp = new Date();
              sendEvent(controller, { type: "done" });
              break;
            }

            // Add assistant message with tool calls
            apiMessages.push({
              role: "assistant",
              content: assistantContent || "",
              tool_calls: toolCalls,
            });

            // Execute tool calls
            for (const toolCall of toolCalls) {
              const name = toolCall.function.name;
              let args: Record<string, unknown> = {};

              try {
                args = JSON.parse(toolCall.function.arguments);
              } catch {
                // Invalid JSON
                sendEvent(controller, {
                  type: "tool_result",
                  name,
                  result: { error: "Invalid tool arguments" },
                  success: false,
                });
                apiMessages.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: JSON.stringify({ error: "Invalid tool arguments" }),
                });
                continue;
              }

              // Log tool call
              toolsCalledLog.push({ name, args, timestamp: new Date() });

              // Send tool start event
              sendEvent(controller, { type: "tool_start", name, args });

              // Execute the tool
              const result = await executeTool(name, args);

              // Log tool result
              toolResultsLog.push({
                name,
                result: result.data || result.error,
                success: result.success,
                timestamp: new Date(),
              });

              // Send tool result event
              sendEvent(controller, {
                type: "tool_result",
                name,
                result: result.data || result.error,
                success: result.success,
              });

              // Add tool result to messages
              apiMessages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result.success ? result.data : { error: result.error }),
              });
            }
          }

          if (iterations >= maxIterations) {
            errorOccurred = true;
            errorMessage = "Maximum iterations reached";
            sendEvent(controller, {
              type: "error",
              message: "Maximum iterations reached",
            });
          }

          // Log the interaction (success case)
          if (sessionId !== undefined && interactionIndex !== undefined) {
            await logChatInteraction({
              sessionId,
              userId,
              interactionIndex,
              userMessage,
              userMessageTimestamp,
              aiResponse: fullAiResponse,
              aiResponseTimestamp,
              responseComplete: !errorOccurred,
              toolsCalled: toolsCalledLog.length > 0 ? toolsCalledLog : undefined,
              toolResults: toolResultsLog.length > 0 ? toolResultsLog : undefined,
              totalDurationMs: Date.now() - startTime,
              llmCalls: llmCallCount,
              errorOccurred,
              errorMessage,
              modelName: getModelName(),
            });
          }
        } catch (error) {
          errorOccurred = true;
          errorMessage = error instanceof Error ? error.message : "Unknown error";
          
          sendEvent(controller, {
            type: "error",
            message: errorMessage,
          });

          // Log the interaction (error case)
          if (sessionId !== undefined && interactionIndex !== undefined) {
            await logChatInteraction({
              sessionId,
              userId,
              interactionIndex,
              userMessage,
              userMessageTimestamp,
              aiResponse: fullAiResponse || undefined,
              aiResponseTimestamp,
              responseComplete: false,
              toolsCalled: toolsCalledLog.length > 0 ? toolsCalledLog : undefined,
              toolResults: toolResultsLog.length > 0 ? toolResultsLog : undefined,
              totalDurationMs: Date.now() - startTime,
              llmCalls: llmCallCount,
              errorOccurred: true,
              errorMessage,
              modelName: getModelName(),
            });
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
