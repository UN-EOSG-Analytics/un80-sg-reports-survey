import { Pool } from "pg";

const globalForDb = global as unknown as { pool: Pool | undefined };

// Get the schema from environment variable
const dbSchema = process.env.DB_SCHEMA || "sg_reports_survey";

export const pool =
  globalForDb.pool ||
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export async function query<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    // Set the search_path to include app schema and public (for pgvector operators)
    await client.query(`SET search_path TO ${dbSchema}, public`);
    const result = await client.query(text, params);
    return result.rows;
  } finally {
    client.release();
  }
}

export default pool;
