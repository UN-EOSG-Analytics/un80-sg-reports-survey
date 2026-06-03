import { Pool, PoolConfig } from "pg";

const globalForDb = global as unknown as { pool: Pool | undefined };

const dbSchema = process.env.DB_SCHEMA || "sg_reports_survey";

// pg's URL parser uses `new URL()`, which rejects passwords containing
// unencoded reserved chars (=, +, /, @, etc.). Parse the URL ourselves and
// hand pg discrete fields so the .env stays readable.
function parseConnectionString(raw: string | undefined): PoolConfig {
  if (!raw) return {};
  // Strip optional surrounding quotes (some .env loaders preserve them).
  const stripped = raw.replace(/^["']|["']$/g, "");
  const m = stripped.match(/^(postgres(?:ql)?):\/\/([^:@]+):([^@]*)@([^:/]+)(?::(\d+))?\/([^?]+)(\?.*)?$/);
  if (!m) {
    return { connectionString: stripped };
  }
  const [, , user, password, host, port, database, qs] = m;
  const config: PoolConfig = {
    user: decodeURIComponent(user),
    password: decodeURIComponent(password),
    host,
    database,
  };
  if (port) config.port = parseInt(port, 10);
  if (qs) {
    const params = new URLSearchParams(qs.startsWith("?") ? qs.slice(1) : qs);
    const sslmode = params.get("sslmode");
    if (sslmode === "require" || sslmode === "verify-ca" || sslmode === "verify-full") {
      config.ssl = { rejectUnauthorized: sslmode !== "require" };
    } else if (sslmode === "disable") {
      config.ssl = false;
    }
  }
  return config;
}

export const pool =
  globalForDb.pool ||
  new Pool({
    ...parseConnectionString(process.env.DATABASE_URL),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export async function query<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO ${dbSchema}, public`);
    const result = await client.query(text, params);
    return result.rows;
  } finally {
    client.release();
  }
}

export default pool;
