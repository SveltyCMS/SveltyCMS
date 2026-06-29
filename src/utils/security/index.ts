/**
 * @file src/utils/security/index.ts
 * @description Security barrel — re-exports from all security domain files.
 *
 * Files:
 *   - crypto.ts       — argon2 hashing, encryption/decryption, worker pool
 *   - constants.ts    — CSP headers, security config
 *   - auth-utils.ts   — session duration parsing
 *   - csrf-utils.ts   — CSRF token generation/validation
 *   - cors-utils.ts   — CORS header utilities
 *   - credential-hash.ts — SHA-256 credential hashing
 *   - mongo-sanitize.ts — MongoDB injection prevention
 *   - permission-cache.ts — Permission caching
 *   - safe-query.ts   — Safe query construction
 */

// crypto.ts removed from barrel — it uses node:module which breaks browser hydration.
// Import directly: import { hashPassword } from "@utils/security/crypto"
export * from "./constants";
export * from "./auth-utils";
export * from "./csrf-utils";
export * from "./cors-utils";
export * from "./credential-hash";
export * from "./mongo-sanitize";
export * from "./permission-cache";
export * from "./safe-query";
