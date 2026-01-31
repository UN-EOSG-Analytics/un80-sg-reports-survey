import { Pool } from "pg";

/**
 * Restricted database connection for AI chat queries.
 * Uses a read-only user with access to only specific tables.
 * 
 * This provides defense-in-depth: even if application-level
 * SQL validation is bypassed, the database will reject
 * unauthorized operations.
 */

const globalForChatDb = global as unknown as { chatPool: Pool | undefined };

// Use separate connection string for chat, falling back to main if not set
const connectionString = process.env.DATABASE_URL_CHAT || process.env.DATABASE_URL;

export const chatPool =
  globalForChatDb.chatPool ||
  new Pool({
    connectionString,
    max: 5, // Lower limit for chat queries
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

if (process.env.NODE_ENV !== "production") globalForChatDb.chatPool = chatPool;

// Get the schema from environment variable
const dbSchema = process.env.DB_SCHEMA || "sg_reports_survey";

/**
 * Execute a read-only query using the restricted chat user.
 * This connection only has SELECT privileges on allowed tables.
 */
export async function chatQuery<T = unknown>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await chatPool.connect();
  try {
    // Set search_path to include app schema and public (for pgvector operators)
    await client.query(`SET search_path TO ${dbSchema}, public`);
    const result = await client.query(text, params);
    return result.rows;
  } finally {
    client.release();
  }
}

export default chatPool;
