import { query } from "./db";
import { chatQuery } from "./db-chat";

// Tool definitions for the AI
export const tools = [
  {
    type: "function" as const,
    function: {
      name: "read_document",
      description:
        "Read the full text content of a UN document by its symbol. Use this to read reports, resolutions, or other UN documents.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Document symbol like A/78/123, A/RES/78/1, S/2024/100",
          },
        },
        required: ["symbol"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_database",
      description:
        "Run a readonly SQL query on the reports database. Only SELECT queries are allowed. Use this to find reports, check statistics, or explore document metadata.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "SELECT query to execute. Must start with SELECT.",
          },
          explanation: {
            type: "string",
            description: "Brief explanation of what this query finds",
          },
        },
        required: ["query", "explanation"],
        additionalProperties: false,
      },
    },
  },
];

// Tool result types
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Read document by symbol
export async function readDocument(symbol: string): Promise<ToolResult> {
  try {
    const results = await query<{
      symbol: string;
      proper_title: string | null;
      title: string | null;
      text: string | null;
      date_year: number | null;
      publication_date: string | null;
      un_body: string | null;
      word_count: number | null;
      subject_terms: string[] | null;
      based_on_resolution_symbols: string[] | null;
    }>(
      `SELECT symbol, proper_title, title, text, date_year, publication_date, 
              un_body, word_count, subject_terms, based_on_resolution_symbols
       FROM documents 
       WHERE symbol = $1
       LIMIT 1`,
      [symbol]
    );

    if (results.length === 0) {
      return {
        success: false,
        error: `Document not found: ${symbol}`,
      };
    }

    const doc = results[0];
    return {
      success: true,
      data: {
        symbol: doc.symbol,
        title: doc.proper_title || doc.title,
        year: doc.date_year,
        publicationDate: doc.publication_date,
        body: doc.un_body,
        wordCount: doc.word_count,
        subjects: doc.subject_terms,
        basedOnResolutions: doc.based_on_resolution_symbols,
        text: doc.text || "(No text content available)",
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to read document: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

// Allowed tables for SQL queries (reports-related only)
const ALLOWED_TABLES = [
  "documents",
  "sg_reports",
  "latest_versions",
  "report_entity_suggestions",
  "report_entity_confirmations",
  "report_frequency_confirmations",
  "report_frequencies",
  "survey_responses",
];

// Forbidden tables (auth/sensitive)
const FORBIDDEN_TABLES = [
  "users",
  "magic_tokens",
  "sessions",
];

// SQL query safety check
function isQuerySafe(sql: string): { safe: boolean; error?: string } {
  const normalized = sql.trim().toLowerCase();

  // Must start with SELECT or WITH (for CTEs)
  if (!normalized.startsWith("select") && !normalized.startsWith("with")) {
    return { safe: false, error: "Only SELECT queries are allowed" };
  }

  // Check for dangerous keywords
  const dangerous = [
    "insert",
    "update",
    "delete",
    "drop",
    "alter",
    "create",
    "truncate",
    "grant",
    "revoke",
    "exec",
    "execute",
    "into",
    "copy",
    "pg_",
  ];

  for (const keyword of dangerous) {
    // Check for keyword as whole word (with word boundaries)
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(sql)) {
      return { safe: false, error: `Query contains forbidden keyword: ${keyword}` };
    }
  }

  // Check for forbidden tables
  for (const table of FORBIDDEN_TABLES) {
    const regex = new RegExp(`\\b${table}\\b`, "i");
    if (regex.test(sql)) {
      return { safe: false, error: `Access to table '${table}' is not allowed` };
    }
  }

  // Check that query only references allowed tables
  // Extract potential table names from FROM and JOIN clauses
  // This regex is more careful to avoid matching:
  // - EXTRACT(... FROM column) - the FROM inside EXTRACT
  // - Function calls like FROM unnest(...) 
  // - SQL keywords like LATERAL
  // - Table aliases

  // Common SQL keywords and functions that aren't table names
  const sqlKeywords = new Set([
    "select", "where", "and", "or", "not", "in", "between", "like", "ilike",
    "is", "null", "true", "false", "as", "on", "using", "order", "by", "group",
    "having", "limit", "offset", "union", "intersect", "except", "all", "distinct",
    "case", "when", "then", "else", "end", "cast", "coalesce", "nullif",
    "lateral", "cross", "inner", "outer", "left", "right", "full", "natural",
    "unnest", "array", "any", "some", "exists", "with", "recursive"
  ]);

  // Match FROM/JOIN followed by table name, handling subqueries and functions
  const tablePattern = /\b(?:from|join)\s+(?:lateral\s+)?([a-z_][a-z0-9_]*)/gi;
  let match;
  while ((match = tablePattern.exec(sql)) !== null) {
    const tableName = match[1].toLowerCase();
    
    // Skip if it's a SQL keyword/function
    if (sqlKeywords.has(tableName)) {
      continue;
    }
    
    // Skip if followed by an open parenthesis (it's a function call like unnest())
    const afterMatch = sql.slice(match.index + match[0].length).trimStart();
    if (afterMatch.startsWith("(")) {
      continue;
    }
    
    if (!ALLOWED_TABLES.includes(tableName)) {
      return { 
        safe: false, 
        error: `Table '${tableName}' is not allowed. Allowed tables: ${ALLOWED_TABLES.join(", ")}` 
      };
    }
  }

  // Also check for schema-prefixed tables like public.tablename or schema.tablename
  // Skip short aliases (1-3 chars) as they're typically table aliases, not schemas
  const schemaTablePattern = /\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/gi;
  while ((match = schemaTablePattern.exec(sql)) !== null) {
    const schema = match[1].toLowerCase();
    const table = match[2].toLowerCase();
    
    // Skip column references like table.column within allowed tables
    if (ALLOWED_TABLES.includes(schema)) {
      continue; // It's table.column, not schema.table
    }
    
    // Skip short aliases (1-3 chars) - these are table aliases like rf, sr, lv, d, s
    if (schema.length <= 3) {
      continue;
    }
    
    // If it looks like schema.table format and schema isn't an allowed table,
    // check if the table part is allowed
    if (!ALLOWED_TABLES.includes(table) && !sqlKeywords.has(schema)) {
      return { 
        safe: false, 
        error: `Schema-prefixed table '${schema}.${table}' is not allowed. Use table names directly: ${ALLOWED_TABLES.join(", ")}` 
      };
    }
  }

  return { safe: true };
}

// Execute readonly SQL query
export async function queryDatabase(
  sql: string,
  explanation: string
): Promise<ToolResult> {
  // Safety check
  const safetyCheck = isQuerySafe(sql);
  if (!safetyCheck.safe) {
    return {
      success: false,
      error: `${safetyCheck.error}. Please retry with a corrected query.`,
    };
  }

  try {
    // Add LIMIT if not present to prevent huge result sets
    let normalizedSql = sql.trim();
    // Remove trailing semicolon for appending LIMIT
    if (normalizedSql.endsWith(";")) {
      normalizedSql = normalizedSql.slice(0, -1).trim();
    }
    const hasLimit = /\blimit\s+\d+/i.test(normalizedSql);
    const safeSql = hasLimit ? normalizedSql : `${normalizedSql} LIMIT 100`;

    // Use restricted database connection (read-only user with limited table access)
    const results = await chatQuery<Record<string, unknown>>(safeSql);

    return {
      success: true,
      data: {
        explanation,
        rowCount: results.length,
        rows: results,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: `Query failed: ${errorMsg}. You may retry with a corrected query. The original query was: ${sql}`,
    };
  }
}

// Execute a tool by name
export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  switch (name) {
    case "read_document":
      return readDocument(args.symbol as string);
    case "query_database":
      return queryDatabase(args.query as string, args.explanation as string);
    default:
      return {
        success: false,
        error: `Unknown tool: ${name}`,
      };
  }
}
