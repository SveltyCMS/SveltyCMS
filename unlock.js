/**
 * @file unlock.js
 * @description
 * Manual account unlock utility for local development recovery.
 * Directly resets failedAttempts and lockoutUntil on a SQLite
 * auth_users table when an account is locked by brute-force protection
 * (5 consecutive failed login attempts = 15-min lockout).
 *
 * Usage:
 *   bun unlock.js user@example.com
 *
 * Safety:
 * - Only works on SQLite (config/database/sveltycms.db.sqlite)
 * - Uses parameterized query — no SQL injection risk
 * - Exits with clear error if database or user not found
 * - This is a development recovery tool, not a production API
 */

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";

const DB_PATH = "config/database/sveltycms.db.sqlite";
const email = process.argv[2]?.trim();

if (!email || email.includes("--")) {
  console.error("Usage: bun unlock.js <email>");
  console.error("Example: bun unlock.js dev@example.com");
  process.exit(1);
}

if (!existsSync(DB_PATH)) {
  console.error(`Database not found: ${DB_PATH}`);
  console.error("This tool only works with local SQLite dev databases.");
  process.exit(1);
}

const db = new Database(DB_PATH);

try {
  const result = db
    .prepare(
      "UPDATE auth_users SET failedAttempts = 0, lockoutUntil = NULL WHERE email = ?",
    )
    .run(email);

  if (result.changes > 0) {
    console.log(`✅ Unlocked ${email}`);
  } else {
    console.error(`❌ User not found: ${email}`);
    process.exit(1);
  }
} finally {
  db.close();
}
