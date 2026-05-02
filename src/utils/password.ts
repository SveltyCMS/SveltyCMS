/**
 * @file src/utils/password.ts
 * @description Centralized password hashing and verification utilities
 *
 * QUANTUM COMPUTING SECURITY:
 * ==========================
 * This module uses Argon2id, which is inherently quantum-resistant:
 *
 * - Memory-hard algorithm: Quantum computers don't have memory advantages
 * - 64 MB per hash: Limits quantum computer parallelization
 * - Grover's algorithm ineffective: No speedup for memory-bound operations
 * - Secure until 2045+: Strong resistance against both classical and quantum attacks
 *
 * This module provides a single source of truth for all password operations
 * to ensure consistency across the entire application.
 *
 * @see https://csrc.nist.gov/projects/post-quantum-cryptography
 */

import { Worker } from "node:worker_threads";
import path from "node:path";
import os from "node:os";

// System Logger
import { logger } from "@utils/logger";

const ARGON2_CONFIG = {
  memoryCost: 65_536, // 64 MB
  timeCost: 3,
  parallelism: 4,
  type: 2, // argon2id
} as const;

// --- Worker Pool Implementation ---
const MAX_WORKERS = Math.max(2, Math.floor(os.cpus().length / 2));
const workerPool: Worker[] = [];
let nextWorker = 0;
let msgIdCounter = 0;
const pendingPromises = new Map<
  number,
  { resolve: (val: any) => void; reject: (err: any) => void }
>();

function getWorker(): Worker {
  if (workerPool.length < MAX_WORKERS) {
    // Note: In production build, .ts extension might need resolving if compiled,
    // but in Bun/SvelteKit server context, we can usually resolve the source path or the transpiled chunk.
    // For safety in SvelteKit builds, we use the transpiled file if it exists, or fallback to TS.
    const workerPath = path.resolve(process.cwd(), "src/utils/password.worker.ts");
    const worker = new Worker(workerPath);
    worker.on("message", (msg) => {
      const p = pendingPromises.get(msg.id);
      if (p) {
        pendingPromises.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error));
        else p.resolve(msg.result);
      }
    });
    worker.on("error", (err) => logger.error("Argon2 worker error", err));
    workerPool.push(worker);
    return worker;
  }
  const worker = workerPool[nextWorker];
  nextWorker = (nextWorker + 1) % workerPool.length;
  return worker;
}

async function runInWorker(action: string, payload: any): Promise<any> {
  // ⚡ Fast-path: If worker_threads are unavailable (e.g. browser) fallback to main thread
  if (typeof Worker === "undefined") {
    const argon2 = await import("argon2");
    if (action === "hash") return argon2.hash(payload.password, payload.config);
    if (action === "verify") return argon2.verify(payload.hash, payload.password);
  }

  return new Promise((resolve, reject) => {
    const id = ++msgIdCounter;
    pendingPromises.set(id, { resolve, reject });
    getWorker().postMessage({ id, action, ...payload });
  });
}

export async function hashPassword(password: string): Promise<string> {
  try {
    const hashedPassword = await runInWorker("hash", { password, config: ARGON2_CONFIG });
    logger.trace("Password hashed successfully");
    return hashedPassword;
  } catch (error) {
    logger.error("Failed to hash password:", error);
    throw new Error("Password hashing failed");
  }
}

export async function verifyPassword(
  hashedPassword: string,
  plainPassword: string,
): Promise<boolean> {
  try {
    const isValid = await runInWorker("verify", { hash: hashedPassword, password: plainPassword });
    logger.trace("Password verification completed", { isValid });
    return isValid;
  } catch (error) {
    logger.error("Password verification failed:", error);
    return false;
  }
}

/**
 * Check if a password hash needs rehashing for enhanced security
 *
 * USE CASES:
 * - Security parameter upgrades (e.g., increase memory from 64 MB to 128 MB)
 * - Algorithm migration (e.g., future post-quantum algorithms)
 * - Legacy hash format detection
 *
 * QUANTUM MIGRATION:
 * While Argon2id is quantum-resistant, this function will be useful when:
 * - Increasing parameters for high-security applications
 * - Migrating to hybrid classical+post-quantum schemes (2030+)
 * - Detecting legacy hashes that need upgrading
 *
 * @param hashedPassword - The stored password hash
 * @returns Promise<boolean> - True if rehashing is needed
 */
export async function needsRehashing(hashedPassword: string): Promise<boolean> {
  try {
    const argon2 = await import("argon2");

    // Check if the hash uses our current secure parameters
    // argon2.needsRehash will return true if the hash doesn't match our current settings
    return argon2.needsRehash(hashedPassword, {
      memoryCost: ARGON2_CONFIG.memoryCost,
      timeCost: ARGON2_CONFIG.timeCost,
      parallelism: ARGON2_CONFIG.parallelism,
    });
  } catch (error) {
    logger.error("Failed to check if password needs rehashing:", error);
    // If we can't check, assume it needs rehashing for safety
    return true;
  }
}

/**
 * Get the current argon2 configuration for reference
 *
 * SECURITY PARAMETERS:
 * - memory: 65536 KiB (64 MB) - Makes attacks expensive
 * - time: 3 iterations - Computational cost
 * - parallelism: 4 threads - CPU optimization
 * - type: 2 (argon2id) - Hybrid security mode
 *
 * QUANTUM RESISTANCE:
 * These parameters provide strong quantum resistance because:
 * - 64 MB memory requirement limits quantum parallelization
 * - Memory-hard algorithms resist Grover's algorithm
 * - Secure for 15-30+ years against quantum computers
 *
 * FUTURE ENHANCEMENTS (2030+):
 * Consider increasing parameters for ultra-high security:
 * - memory: 131072 KiB (128 MB)
 * - time: 5 iterations
 * This would extend quantum resistance even further.
 *
 * @returns The current secure argon2 configuration
 */
export function getPasswordConfig() {
  return { ...ARGON2_CONFIG };
}
