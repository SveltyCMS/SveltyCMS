/**
 * @file src/utils/connection-parser.ts
 * @description Utility for parsing database connection strings across different providers.
 *
 * Features:
 * - MongoDB (standard and +srv)
 * - MariaDB / MySQL
 * - PostgreSQL / Postgres
 * - SQLite
 */

import { logger } from "./logger";

export interface ParsedConnection {
  type: "mongodb" | "mongodb+srv" | "mariadb" | "postgresql" | "sqlite";
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  authSource?: string;
}

/**
 * Parses a database connection string into a structured object.
 * Supports mongodb://, mongodb+srv://, mariadb://, mysql://, postgresql://, postgres://, sqlite://
 */
export function parseConnectionString(connStr: string): ParsedConnection | null {
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

    // Use URL parser by replacing protocol with http to handle any format consistently
    const tempUrl = new URL(trimmed.replace(/^[a-z0-9+]+:\/\//, "http://"));

    const user = tempUrl.username ? decodeURIComponent(tempUrl.username) : "";
    const password = tempUrl.password ? decodeURIComponent(tempUrl.password) : "";

    // Clean up typical placeholders
    const cleanPassword =
      password === "<db_password>" || password === "<password>" || password === "YOUR_PASSWORD"
        ? ""
        : password;

    const host = tempUrl.hostname;
    const port = tempUrl.port || "";
    // Remove leading / and any query params from the path to get the database name
    const database = tempUrl.pathname.slice(1).split("?")[0];

    const result: ParsedConnection = {
      type,
      host,
      port,
      user,
      password: cleanPassword,
      database: database || "",
    };

    // Special handling for MongoDB authSource parameters
    try {
      const realUrl = new URL(trimmed);
      const authSource = realUrl.searchParams.get("authSource");
      if (authSource) {
        result.authSource = authSource;
      } else if (type === "mongodb") {
        // Standard MongoDB often defaults to admin for auth
        result.authSource = "admin";
      }
    } catch {
      // If full URL parsing fails for search params, we still have the core data
      if (type === "mongodb") result.authSource = "admin";
    }

    return result;
  } catch (error) {
    logger.error("Error parsing connection string:", error);
    return null;
  }
}
