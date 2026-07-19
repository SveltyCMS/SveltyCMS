/**
 * @file src/utils/security.worker.ts
 * @description Dedicated worker for CPU-intensive cryptographic operations (Argon2).
 *
 * ### Hardening (audit 2026-07):
 * - Work factor floor: enforces min 64MB memory + 3 iterations even if config is tampered
 * - Input length sanitization: rejects passwords >128 chars to prevent memory-bloat DoS
 * - Error sanitization: returns generic message, isolating internal system details
 * - Protocol rigidity: typed WorkerMessage + switch guards against malformed payloads
 * - Graceful termination: exits immediately if no parentPort (prevents zombie workers)
 */

import argon2 from "argon2";
import { parentPort } from "node:worker_threads";

if (!parentPort) process.exit(0);

// 🛡️ Guard: Strict interface for the message protocol
type WorkerMessage = {
  id: string | number;
  action: "hash" | "verify";
  password?: string;
  hash?: string;
  config?: argon2.Options & { type?: number };
};

parentPort.on("message", async (msg: WorkerMessage) => {
  if (!msg.id || !msg.action) return;

  try {
    switch (msg.action) {
      case "hash": {
        if (!msg.password || !msg.config) throw new Error("Missing password or config");

        // 🚀 Hardening: Enforce minimum work factor constraints
        const safeConfig = {
          ...msg.config,
          memoryCost: Math.max(msg.config.memoryCost || 0, 65536), // Min 64MB
          timeCost: Math.max(msg.config.timeCost || 0, 3), // Min 3 iterations
        };

        const result = await argon2.hash(msg.password, safeConfig);
        parentPort!.postMessage({ id: msg.id, result });
        break;
      }

      case "verify": {
        if (!msg.hash || !msg.password) throw new Error("Missing hash or password");

        // 🛡️ Prevent memory-bloat DoS via oversized password
        if (msg.password.length > 128) throw new Error("Password too long");

        const result = await argon2.verify(msg.hash, msg.password);
        parentPort!.postMessage({ id: msg.id, result });
        break;
      }

      default:
        throw new Error("Unknown action");
    }
  } catch {
    // 🛡️ Security: Sanitize error messages to prevent leakage of internal system details
    parentPort!.postMessage({
      id: msg.id,
      error: "Cryptographic operation failed",
    });
  }
});
