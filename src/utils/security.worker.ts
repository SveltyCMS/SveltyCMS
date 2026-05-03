/**
 * @file src/utils/security.worker.ts
 * @description Dedicated worker for CPU-intensive cryptographic operations (Argon2).
 */

import argon2 from "argon2";
import { parentPort } from "node:worker_threads";

if (parentPort) {
  parentPort.on("message", async (msg) => {
    try {
      if (msg.action === "hash") {
        const result = await argon2.hash(msg.password, msg.config);
        parentPort?.postMessage({ id: msg.id, result });
      } else if (msg.action === "verify") {
        const result = await argon2.verify(msg.hash, msg.password);
        parentPort?.postMessage({ id: msg.id, result });
      }
    } catch (error: any) {
      parentPort?.postMessage({ id: msg.id, error: error.message });
    }
  });
}
