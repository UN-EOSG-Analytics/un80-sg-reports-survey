/**
 * Chat Agent Test Harness
 *
 * This script imports the chat tools from the app and runs test cases
 * to evaluate and improve the AI agent's SQL query generation.
 *
 * Usage: npm run test:chat
 */

// Note: dotenv is loaded via --require dotenv/config in package.json
// This ensures env vars are available before any imports initialize db pools

import { tools, executeTool } from "../src/lib/chat-tools";
import * as fs from "fs";
import * as path from "path";

// Azure AI Foundry configuration (same as route.ts)
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

// System prompt - imported from route.ts (keep in sync!)
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
\`\`\`

## Common Tasks
- **Read a report**: read_document, then summarize key points
- **Compare reports**: read both, table of differences
- **Find mandating resolutions**: query based_on_resolution_symbols, then read_document on resolution
- **Find reports by topic**: query with subject_terms or title ILIKE`;

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

// Test case definition
interface TestCase {
  id: number;
  prompt: string;
  expectedBehavior: string;
}

// Test result
interface TestResult {
  testCase: TestCase;
  messages: ChatMessage[];
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
    result: unknown;
    success: boolean;
  }>;
  finalResponse: string;
  sqlQueries: string[];
  errors: string[];
  iterations: number;
}

// Test cases
const TEST_CASES: TestCase[] = [
  {
    id: 1,
    prompt: "How many SG reports are there from 2024?",
    expectedBehavior:
      "Should use publication_date or effective_year, not date_year which is often empty",
  },
  {
    id: 2,
    prompt: "List reports about climate change",
    expectedBehavior:
      "Should search subject_terms array or title ILIKE '%climate%'",
  },
  {
    id: 3,
    prompt: "Show me reports with frequency 'annual'",
    expectedBehavior: "Should join with report_frequencies table",
  },
  {
    id: 4,
    prompt: "What reports were published in 2023 about disarmament?",
    expectedBehavior:
      "Should use publication_date for year and subject_terms for topic",
  },
  {
    id: 5,
    prompt: "Find the latest version of the SDG progress report",
    expectedBehavior: "Should use latest_versions view or search by proper_title",
  },
  {
    id: 6,
    prompt: "How many reports does each UN body submit?",
    expectedBehavior: "Should GROUP BY un_body and COUNT",
  },
  {
    id: 7,
    prompt: "What subject terms are most common in SG reports?",
    expectedBehavior: "Should unnest subject_terms array and count",
  },
  {
    id: 8,
    prompt: "List reports that have survey responses with status 'continue'",
    expectedBehavior: "Should join sg_reports with survey_responses",
  },
  {
    id: 9,
    prompt: "Show reports with biennial frequency",
    expectedBehavior: "Should use report_frequencies table",
  },
  {
    id: 10,
    prompt: "How many reports were published each year?",
    expectedBehavior:
      "Should extract year from publication_date, not use date_year",
  },
];

// Call Azure OpenAI API (non-streaming for simplicity)
async function callChatCompletion(
  messages: ChatMessage[]
): Promise<{
  content: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}> {
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
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  return {
    content: choice?.message?.content || "",
    tool_calls: choice?.message?.tool_calls,
  };
}

// Run a single test case
async function runTestCase(testCase: TestCase): Promise<TestResult> {
  console.log(`\n--- Running Test ${testCase.id}: "${testCase.prompt}" ---`);

  const result: TestResult = {
    testCase,
    messages: [],
    toolCalls: [],
    finalResponse: "",
    sqlQueries: [],
    errors: [],
    iterations: 0,
  };

  // Initialize messages
  const apiMessages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: testCase.prompt },
  ];

  result.messages.push({ role: "user", content: testCase.prompt });

  const maxIterations = 10;

  try {
    while (result.iterations < maxIterations) {
      result.iterations++;

      const response = await callChatCompletion(apiMessages);

      // If no tool calls, we're done
      if (!response.tool_calls || response.tool_calls.length === 0) {
        result.finalResponse = response.content;
        result.messages.push({ role: "assistant", content: response.content });
        console.log(`  Final response received after ${result.iterations} iteration(s)`);
        break;
      }

      // Add assistant message with tool calls
      apiMessages.push({
        role: "assistant",
        content: response.content || "",
        tool_calls: response.tool_calls,
      });

      result.messages.push({
        role: "assistant",
        content: response.content || "",
        tool_calls: response.tool_calls,
      });

      // Execute tool calls
      for (const toolCall of response.tool_calls) {
        const name = toolCall.function.name;
        let args: Record<string, unknown> = {};

        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          result.errors.push(`Invalid JSON arguments for ${name}`);
          continue;
        }

        console.log(`  Tool call: ${name}(${JSON.stringify(args).substring(0, 100)}...)`);

        // Track SQL queries
        if (name === "query_database" && args.query) {
          result.sqlQueries.push(args.query as string);
        }

        // Execute the tool
        const toolResult = await executeTool(name, args);

        result.toolCalls.push({
          name,
          args,
          result: toolResult.data || toolResult.error,
          success: toolResult.success,
        });

        if (!toolResult.success) {
          result.errors.push(`Tool ${name} failed: ${toolResult.error}`);
          console.log(`    Error: ${toolResult.error}`);
        } else {
          console.log(`    Success: ${JSON.stringify(toolResult.data).substring(0, 100)}...`);
        }

        // Add tool result to messages
        apiMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(
            toolResult.success ? toolResult.data : { error: toolResult.error }
          ),
        });

        result.messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(
            toolResult.success ? toolResult.data : { error: toolResult.error }
          ),
        });
      }
    }

    if (result.iterations >= maxIterations) {
      result.errors.push("Maximum iterations reached");
    }
  } catch (error) {
    result.errors.push(
      `Exception: ${error instanceof Error ? error.message : "Unknown error"}`
    );
    console.error(`  Exception:`, error);
  }

  return result;
}

// Analyze results
interface AnalysisReport {
  timestamp: string;
  totalTests: number;
  successfulTests: number;
  failedTests: number;
  totalSqlQueries: number;
  sqlIssues: Array<{
    testId: number;
    query: string;
    issue: string;
  }>;
  commonPatterns: string[];
  recommendations: string[];
}

function analyzeResults(results: TestResult[]): AnalysisReport {
  const report: AnalysisReport = {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    successfulTests: 0,
    failedTests: 0,
    totalSqlQueries: 0,
    sqlIssues: [],
    commonPatterns: [],
    recommendations: [],
  };

  const sqlPatterns = {
    usesDateYear: 0,
    usesPublicationDate: 0,
    usesEffectiveYear: 0,
    usesLatestVersions: 0,
    usesReportFrequencies: 0,
    usesSubjectTermsCorrectly: 0,
  };

  for (const result of results) {
    if (result.errors.length === 0 && result.finalResponse) {
      report.successfulTests++;
    } else {
      report.failedTests++;
    }

    report.totalSqlQueries += result.sqlQueries.length;

    for (const query of result.sqlQueries) {
      const lowerQuery = query.toLowerCase();

      // Check for date_year usage (problematic)
      if (lowerQuery.includes("date_year") && !lowerQuery.includes("coalesce")) {
        report.sqlIssues.push({
          testId: result.testCase.id,
          query,
          issue:
            "Uses date_year directly without COALESCE - date_year is often empty",
        });
        sqlPatterns.usesDateYear++;
      }

      // Check for publication_date usage (good)
      if (lowerQuery.includes("publication_date")) {
        sqlPatterns.usesPublicationDate++;
      }

      // Check for effective_year usage (good - from views)
      if (lowerQuery.includes("effective_year")) {
        sqlPatterns.usesEffectiveYear++;
      }

      // Check for latest_versions usage
      if (lowerQuery.includes("latest_versions")) {
        sqlPatterns.usesLatestVersions++;
      }

      // Check for report_frequencies usage
      if (lowerQuery.includes("report_frequencies")) {
        sqlPatterns.usesReportFrequencies++;
      }

      // Check for correct array handling
      if (
        lowerQuery.includes("any(") ||
        lowerQuery.includes("@>") ||
        lowerQuery.includes("unnest(")
      ) {
        sqlPatterns.usesSubjectTermsCorrectly++;
      }
    }
  }

  // Generate common patterns summary
  report.commonPatterns = [
    `date_year usage (problematic): ${sqlPatterns.usesDateYear} queries`,
    `publication_date usage (good): ${sqlPatterns.usesPublicationDate} queries`,
    `effective_year usage (good): ${sqlPatterns.usesEffectiveYear} queries`,
    `latest_versions view usage: ${sqlPatterns.usesLatestVersions} queries`,
    `report_frequencies table usage: ${sqlPatterns.usesReportFrequencies} queries`,
    `Correct array handling (ANY/@>/unnest): ${sqlPatterns.usesSubjectTermsCorrectly} queries`,
  ];

  // Generate recommendations
  if (sqlPatterns.usesDateYear > 0) {
    report.recommendations.push(
      "Add explicit warning that date_year is often NULL - use publication_date or views with effective_year"
    );
  }

  if (sqlPatterns.usesReportFrequencies === 0 && report.totalSqlQueries > 0) {
    report.recommendations.push(
      "Add report_frequencies table to system prompt - it contains calculated_frequency, gap_history"
    );
  }

  if (sqlPatterns.usesLatestVersions < report.totalTests / 2) {
    report.recommendations.push(
      "Emphasize latest_versions view which has effective_year and entity columns already computed"
    );
  }

  return report;
}

// Main function
async function main() {
  console.log("=== Chat Agent Test Harness ===\n");

  // Verify environment
  if (!getEndpoint() || !getApiKey()) {
    console.error("Error: AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY must be set");
    process.exit(1);
  }

  console.log(`Endpoint: ${getEndpoint()}`);
  console.log(`Model: ${getModelName()}`);
  console.log(`Running ${TEST_CASES.length} test cases...\n`);

  const results: TestResult[] = [];

  for (const testCase of TEST_CASES) {
    const result = await runTestCase(testCase);
    results.push(result);

    // Small delay between tests to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Analyze results
  const analysis = analyzeResults(results);

  // Prepare output
  const output = {
    analysis,
    results,
  };

  // Save to file
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(
    process.cwd(),
    "results",
    `chat-test-${timestamp}.json`
  );

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log("\n=== Analysis Report ===");
  console.log(`Total tests: ${analysis.totalTests}`);
  console.log(`Successful: ${analysis.successfulTests}`);
  console.log(`Failed: ${analysis.failedTests}`);
  console.log(`Total SQL queries: ${analysis.totalSqlQueries}`);

  console.log("\nSQL Issues Found:");
  for (const issue of analysis.sqlIssues) {
    console.log(`  Test ${issue.testId}: ${issue.issue}`);
  }

  console.log("\nCommon Patterns:");
  for (const pattern of analysis.commonPatterns) {
    console.log(`  - ${pattern}`);
  }

  console.log("\nRecommendations:");
  for (const rec of analysis.recommendations) {
    console.log(`  - ${rec}`);
  }

  console.log(`\nResults saved to: ${outputPath}`);
}

main().catch(console.error);
