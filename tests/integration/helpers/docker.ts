/**
 * @file tests/integration/helpers/docker.ts
 * @description Utility to detect running Docker containers for database adapter tests.
 *
 * ### Features:
 * - Fast `docker ps` check with short timeout
 * - Works even when unit suite mocks `node:child_process` (Bun.spawnSync fallback)
 * - Graceful fallback when Docker is unavailable
 * - CI override: always returns true (CI provides the containers)
 *
 * Container name substrings (match tests/docker-compose.yml):
 * - `mongo` → sveltycms-mongodb
 * - `postgres` → sveltycms-postgresql
 * - `mariadb` → sveltycms-mariadb
 * - `redis` → sveltycms-redis
 */

let dockerDetectionCache: Record<string, boolean | null> = {};

function listDockerNames(): string {
  // Prefer Bun.spawnSync — never hits vitest/bun unit mocks of node:child_process.
  if (typeof Bun !== "undefined" && typeof Bun.spawnSync === "function") {
    const result = Bun.spawnSync(["docker", "ps", "--format", "{{.Names}}"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode !== 0) return "";
    return new TextDecoder().decode(result.stdout);
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { execSync } = require("node:child_process") as typeof import("node:child_process");
  return execSync("docker ps --format '{{.Names}}'", {
    encoding: "utf8",
    timeout: 2000,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

/**
 * Returns true if a Docker container with the given name substring is currently running.
 * Results are cached for the process lifetime to avoid repeated docker ps calls.
 * In CI, always returns true.
 */
export function isDockerRunning(containerName: string): boolean {
  if (process.env.CI === "true") return true;

  if (dockerDetectionCache[containerName] !== undefined) {
    return dockerDetectionCache[containerName] as boolean;
  }

  try {
    const ps = listDockerNames();
    const result = ps.toLowerCase().includes(containerName.toLowerCase());
    dockerDetectionCache[containerName] = result;
    return result;
  } catch {
    dockerDetectionCache[containerName] = false;
    return false;
  }
}

/** Clears the Docker detection cache (useful in test cleanup) */
export function clearDockerCache(): void {
  dockerDetectionCache = {};
}

/** Snapshot of which test DBs are reachable via Docker (local multi-adapter runs). */
export function detectAvailableDbAdapters(): {
  sqlite: true;
  mongodb: boolean;
  postgresql: boolean;
  mariadb: boolean;
} {
  return {
    sqlite: true,
    mongodb: isDockerRunning("mongo"),
    postgresql: isDockerRunning("postgres"),
    mariadb: isDockerRunning("mariadb"),
  };
}
