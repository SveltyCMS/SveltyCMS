/**
 * @file src/utils/security.ts
 * @description Unified security and cryptography system for SveltyCMS.
 *
 * Consolidates:
 * - Password hashing and verification (Argon2id with Worker Pool)
 * - AES-256-GCM data encryption/decryption
 * - Secure token and UUID generation
 * - SHA256 checksums
 */

import { logger } from "./logger";
import { generateSecureToken, generateUUID as uuidv4 } from "./native-utils";

// --- Types & Constants ---

export const ARGON2_CONFIG = {
  memoryCost: 65_536, // 64 MB
  timeCost: 3,
  parallelism: 4,
  type: 2, // argon2id
} as const;

export const ENCRYPTION_CONFIG = {
  algorithm: "aes-256-gcm" as const,
  keyLength: 32,
  ivLength: 16,
  saltLength: 32,
  authTagLength: 16,
};

const IS_SERVER =
  typeof window === "undefined" || (typeof process !== "undefined" && process.versions != null);

// --- Worker Pool (for Argon2) ---

let _maxWorkers = 2;
let _isMaxWorkersInitialized = false;

const workerPool: any[] = [];
let nextWorker = 0;
let msgIdCounter = 0;
const pendingPromises = new Map<
  number,
  { resolve: (val: any) => void; reject: (err: any) => void }
>();

async function getWorker(): Promise<any> {
  if (!IS_SERVER) throw new Error("Security workers are only available on the server");

  const { Worker } = await import("node:worker_threads");
  const path = await import("node:path");

  if (!_isMaxWorkersInitialized) {
    try {
      const os = await import("node:os");
      _maxWorkers = Math.max(2, Math.floor((os.cpus?.().length || 4) / 2));
    } catch {
      _maxWorkers = 2;
    }
    _isMaxWorkersInitialized = true;
  }

  if (workerPool.length < _maxWorkers) {
    const workerPath = path.resolve(process.cwd(), "src/utils/security.worker.ts");
    const worker = new Worker(workerPath);
    worker.on("message", (msg) => {
      const p = pendingPromises.get(msg.id);
      if (p) {
        pendingPromises.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error));
        else p.resolve(msg.result);
      }
    });
    worker.on("error", (err) => logger.error("Security worker error", err));
    workerPool.push(worker);
    return worker;
  }
  const worker = workerPool[nextWorker];
  nextWorker = (nextWorker + 1) % workerPool.length;
  return worker;
}

async function runSecurityTask(action: string, payload: any): Promise<any> {
  if (!IS_SERVER) {
    const argon2 = await import("argon2");
    if (action === "hash") return argon2.hash(payload.password, payload.config);
    if (action === "verify") return argon2.verify(payload.hash, payload.password);
  }

  const worker = await getWorker();

  return new Promise((resolve, reject) => {
    const id = ++msgIdCounter;
    pendingPromises.set(id, { resolve, reject });
    worker.postMessage({ id, action, ...payload });
  });
}

// --- Password Utilities ---

export async function hashPassword(password: string): Promise<string> {
  // Ensure consistent UTF-8 encoding for unicode passwords
  const pwd = Buffer.from(password, "utf8");
  return runSecurityTask("hash", { password: pwd, config: ARGON2_CONFIG });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  // Ensure consistent UTF-8 encoding for unicode passwords
  const pwd = Buffer.from(password, "utf8");
  return runSecurityTask("verify", { hash, password: pwd });
}

export async function needsRehashing(hash: string): Promise<boolean> {
  if (!IS_SERVER) return true;
  const argon2 = await import("argon2");
  return argon2.needsRehash(hash, ARGON2_CONFIG);
}

// --- Encryption Utilities ---

export async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  const argon2 = await import("argon2");
  const pwd = Buffer.from(password, "utf8");
  const hash = await argon2.hash(pwd, { ...ARGON2_CONFIG, salt, raw: true });
  return Buffer.from(hash).subarray(0, ENCRYPTION_CONFIG.keyLength);
}

export async function encryptData(data: any, password: string): Promise<string> {
  const crypto = await import("node:crypto");
  const salt = crypto.randomBytes(ENCRYPTION_CONFIG.saltLength);
  const iv = crypto.randomBytes(ENCRYPTION_CONFIG.ivLength);
  const key = await deriveKey(password, salt);

  const cipher = crypto.createCipheriv(ENCRYPTION_CONFIG.algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([salt, iv, authTag, encrypted]).toString("base64");
}

export async function decryptData(encryptedData: string, password: string): Promise<any> {
  const crypto = await import("node:crypto");
  const combined = Buffer.from(encryptedData, "base64");

  let offset = 0;
  const salt = combined.subarray(offset, (offset += ENCRYPTION_CONFIG.saltLength));
  const iv = combined.subarray(offset, (offset += ENCRYPTION_CONFIG.ivLength));
  const authTag = combined.subarray(offset, (offset += ENCRYPTION_CONFIG.authTagLength));
  const encrypted = combined.subarray(offset);

  const key = await deriveKey(password, Buffer.from(salt));
  const decipher = crypto.createDecipheriv(ENCRYPTION_CONFIG.algorithm, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

// --- Token & Hash Utilities ---

/**
 * Generates a high-entropy secure token.
 * Uses platform-native CSPRNG via native-utils.
 */
export async function generateRandomToken(length = 32): Promise<string> {
  return generateSecureToken(length);
}

/**
 * Generates a RFC 4122 compliant v4 UUID.
 * Uses platform-native CSPRNG via native-utils.
 */
export async function generateUUID(): Promise<string> {
  return uuidv4();
}

/**
 * Creates a SHA-256 checksum for the provided data.
 */
export async function createChecksum(data: any): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}
