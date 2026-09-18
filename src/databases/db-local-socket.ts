/**
 * @file src/databases/db-local-socket.ts
 * @description Same-host DB transport: Unix sockets when present, IPv4 loopback otherwise.
 * Windows has no PG/Maria Unix socket from the host into Docker Desktop — TCP 127.0.0.1.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

const PG_SOCKET_NAME = ".s.PGSQL.5432";
const PG_SOCKET_DIRS = ["/var/run/postgresql", "/run/postgresql", "/tmp", "/tmp/svelty-pg-run"];
const MYSQL_SOCKETS = [
  "/var/run/mysqld/mysqld.sock",
  "/run/mysqld/mysqld.sock",
  "/tmp/mysql.sock",
  "/tmp/svelty-mysql-run/mysqld.sock",
];

export function isLoopbackHost(host?: string | null): boolean {
  if (!host) return true;
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0";
}

/** Avoid AAAA/localhost dual-stack delay (common on Windows + Docker Desktop). */
export function preferIpv4Loopback(host: string): string {
  if (host === "localhost" || host === "::1" || host === "[::1]") return "127.0.0.1";
  return host;
}

function unixPlatform(): boolean {
  return process.platform !== "win32";
}

/** Directory containing `.s.PGSQL.5432`, or undefined. */
export function detectPostgresSocketDir(host?: string | null): string | undefined {
  if (!unixPlatform()) return undefined;
  const env = process.env.DATABASE_SOCKET || process.env.PGHOST;
  if (env && env.startsWith("/") && existsSync(join(env, PG_SOCKET_NAME))) return env;
  if (host && !isLoopbackHost(host) && !host.startsWith("/")) return undefined;
  if (host && host.startsWith("/") && existsSync(join(host, PG_SOCKET_NAME))) return host;
  for (const dir of PG_SOCKET_DIRS) {
    if (existsSync(join(dir, PG_SOCKET_NAME))) return dir;
  }
  return undefined;
}

export function detectMysqlSocketPath(host?: string | null): string | undefined {
  if (!unixPlatform()) return undefined;
  const env = process.env.DATABASE_SOCKET || process.env.MYSQL_UNIX_PORT;
  if (env && env.startsWith("/") && existsSync(env)) return env;
  if (host && !isLoopbackHost(host)) return undefined;
  for (const sock of MYSQL_SOCKETS) {
    if (existsSync(sock)) return sock;
  }
  return undefined;
}
