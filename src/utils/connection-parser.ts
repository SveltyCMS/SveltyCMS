/**
 * @file src/utils/connection-parser.ts
 * @description Hardened database connection string parser.
 *
 * ### Hardening (audit 2026-07):
 * - Sensitive log protection: error logs never include the connection string (may contain passwords)
 * - Strict type checking: typeof guard prevents runtime errors on non-string input
 * - Set-based placeholders: O(1) lookup replaces || chains for placeholder detection
 * - Graceful URL handling: new URL() natively parses standard URI schemes
 *
 * Supports: MongoDB (+srv), MariaDB, MySQL, PostgreSQL, SQLite.
 */

import { logger } from "./logger";

export interface ParsedConnection {
  type: "mongodb" | "mongodb+srv" | "mariadb" | "postgresql" | "sqlite";
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

// 🛡️ Set-based placeholder detection (O(1) lookup)
const PLACEHOLDER_PASSWORDS = new Set(["<db_password>", "<password>", "YOUR_PASSWORD"]);

/**
 * Parses a database connection string into a structured object.
 */
export function parseConnectionString(connStr: string): ParsedConnection | null {
  // 🛡️ Strict type check
  if (typeof connStr !== "string") return null;

  try {
    const trimmed = connStr.trim();
    if (!trimmed) return null;

    let type: ParsedConnection["type"];
    if (trimmed.startsWith("mongodb+srv://")) type = "mongodb+srv";
    else if (trimmed.startsWith("mongodb://")) type = "mongodb";
    else if (trimmed.startsWith("mariadb://") || trimmed.startsWith("mysql://")) type = "mariadb";
    else if (trimmed.startsWith("postgresql://") || trimmed.startsWith("postgres://"))
      type = "postgresql";
    else if (trimmed.startsWith("sqlite://")) type = "sqlite";
    else return null;

    // Use URL parser — preserves host/port/path from standard URI schemes
    const tempUrl = new URL(trimmed.replace(/^[a-z0-9+]+:\/\//, "http://"));

    const user = tempUrl.username ? decodeURIComponent(tempUrl.username) : "";
    const password = tempUrl.password ? decodeURIComponent(tempUrl.password) : "";

    const cleanPassword = PLACEHOLDER_PASSWORDS.has(password) ? "" : password;

    const host = tempUrl.hostname;
    const port = tempUrl.port || "";
    const database = tempUrl.pathname.slice(1).split("?")[0];

    return {
      type,
      host,
      port,
      user,
      password: cleanPassword,
      database: database || "",
    };
  } catch {
    // 🛡️ Never log connStr — may contain passwords
    logger.error("[ConnectionParser] Failed to parse connection string (details redacted)");
    return null;
  }
}
