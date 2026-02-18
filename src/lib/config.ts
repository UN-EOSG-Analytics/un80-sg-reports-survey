// App namespace/schema for database tables
export const DB_SCHEMA = process.env.DB_SCHEMA || "app";

// Table names with schema prefix
export const tables = {
  users: `${DB_SCHEMA}.users`,
  magic_tokens: `${DB_SCHEMA}.magic_tokens`,
  allowed_domains: `${DB_SCHEMA}.allowed_domains`,
  admin_emails: `${DB_SCHEMA}.admin_emails`,
} as const;

/**
 * SQL fragment that excludes admin users from a query.
 * @param alias - the table alias for the users table (default: "u")
 * @example
 *   `SELECT * FROM ${tables.users} u WHERE ${notAdminSQL()}`
 */
export const notAdminSQL = (alias = "u") =>
  `NOT EXISTS (SELECT 1 FROM ${tables.admin_emails} ae WHERE ae.email = ${alias}.email)`;
