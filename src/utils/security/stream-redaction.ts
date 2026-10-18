/**
 * @file src/utils/security/stream-redaction.ts
 * @description Deterministic secret/PII redaction for complete strings and chunked streams.
 *
 * The redactor is intentionally pattern-based (no model calls, no randomness): the
 * same input always produces the same output, which makes it safe for SSE framing
 * and easy to reason about in tests.
 *
 * Features:
 * - Complete-string redaction via `redactSecrets`
 * - Chunk-safe streaming redaction via `createStreamRedactor` (bounded tail hold-back)
 * - API keys (`sck_`, `sk-`), Bearer tokens, JWTs, PEM private keys
 * - Email addresses, phone numbers, and Luhn-valid card-like digit groups
 * - Never redacts SSE framing (`event:`, `id:`, `retry:`) — callers pass payloads only
 */

const REDACTED = "[REDACTED]";

/** PEM private key block, including the END banner. */
const PRIVATE_KEY_BLOCK =
  /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/gi;

/**
 * Unterminated PEM block (header + body, no END). Redacting to the end of the
 * input is deliberate: a leaked key body is worse than over-redacting trailing prose.
 */
const PRIVATE_KEY_UNTERMINATED = /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----[\s\S]*$/gi;

/** JSON Web Token: three base64url segments, the first always starting with `eyJ`. */
const JWT_TOKEN = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g;

/** SveltyCMS-style `sck_` API keys. */
const SCK_API_KEY = /\bsck_[A-Za-z0-9_-]{8,}\b/g;

/** OpenAI/Anthropic-style `sk-` keys (including project keys such as `sk-proj-…`). */
const SK_API_KEY = /\bsk-[A-Za-z0-9_-]{16,}\b/g;

/** `Authorization: Bearer <token>` credentials. */
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9\-._~+/]{8,}={0,2}/gi;

/** Email addresses — intentionally conservative to avoid matching prose. */
const EMAIL_ADDRESS = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/** Candidate card numbers (13–19 digits, optional spaces/hyphens). */
const CARD_CANDIDATE = /(?<![\d])(?:\d[ -]?){12,18}\d(?![\d])/g;

/** Candidate phone numbers (10–15 digits, optional grouping). */
const PHONE_CANDIDATE = /(?<![\d][\s.-])(?<![\d])\+?\d[\d\s().-]{7,}\d(?![\s.-]?\d)(?![\w\d])/g;

/** Characters that can appear inside a secret token — used for safe stream cuts. */
const TOKEN_CHAR = /[A-Za-z0-9_.+/=@-]/;

/** Default tail held back by the stream redactor. */
const DEFAULT_TAIL_CHARS = 256;
/** Hard cap on token run expansion, so a pathological input cannot buffer forever. */
const MAX_TOKEN_HOLDBACK_CHARS = 4_096;

function countDigits(value: string): number {
  let count = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 48 && code <= 57) count++;
  }
  return count;
}

/** Luhn checksum — used to avoid redacting arbitrary long numbers. */
function isLuhnValid(value: string): boolean {
  const digits: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 48 && code <= 57) digits.push(code - 48);
  }
  if (digits.length < 13) return false;

  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = digits[i];
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function isPhoneLike(value: string): boolean {
  const digits = countDigits(value);
  return digits >= 10 && digits <= 15;
}

/**
 * Redacts secrets and PII from a complete string.
 *
 * Deterministic and idempotent: redacting an already-redacted string leaves it
 * unchanged because `[REDACTED]` does not match any pattern.
 */
export function redactSecrets(text: string): string {
  if (!text) return text;

  return text
    .replace(PRIVATE_KEY_BLOCK, REDACTED)
    .replace(PRIVATE_KEY_UNTERMINATED, REDACTED)
    .replace(JWT_TOKEN, REDACTED)
    .replace(SCK_API_KEY, REDACTED)
    .replace(SK_API_KEY, REDACTED)
    .replace(BEARER_TOKEN, REDACTED)
    .replace(EMAIL_ADDRESS, REDACTED)
    .replace(CARD_CANDIDATE, (match) => (isLuhnValid(match) ? REDACTED : match))
    .replace(PHONE_CANDIDATE, (match) => (isPhoneLike(match) ? REDACTED : match));
}

export interface StreamRedactor {
  /** Feed a chunk; returns the redacted portion that is safe to emit now. */
  push(chunk: string): string;
  /** Release the bounded tail, redacted. */
  flush(): string;
}

/**
 * Creates a chunk-safe redactor. A bounded tail (default 256 chars) is held
 * back so a secret split across chunks is still matched, and the cut point is
 * moved to a token/whitespace boundary so secrets are never half-emitted.
 */
export function createStreamRedactor(tailChars = DEFAULT_TAIL_CHARS): StreamRedactor {
  const tail = Math.max(1, Math.floor(tailChars));
  let buffer = "";

  return {
    push(chunk: string): string {
      if (!chunk) return "";
      buffer += chunk;
      if (buffer.length <= tail) return "";

      let cut = buffer.length - tail;

      // 1. Never cut inside a whitespace-delimited token.
      const holdbackLimit = Math.max(0, cut - MAX_TOKEN_HOLDBACK_CHARS);
      let tokenStart = cut;
      while (tokenStart > holdbackLimit && TOKEN_CHAR.test(buffer[tokenStart - 1])) {
        tokenStart--;
      }
      cut = tokenStart;

      // 2. Never cut inside a PEM private-key block (including its body).
      const lower = buffer.toLowerCase();
      let searchFrom = 0;
      while (searchFrom < cut) {
        const begin = lower.indexOf("-----begin", searchFrom);
        if (begin === -1 || begin >= cut) break;
        const end = lower.indexOf("-----end", begin);
        if (end === -1) {
          cut = begin;
          break;
        }
        if (end < cut) {
          searchFrom = end + 9;
          continue;
        }
        // The cut falls inside a complete block — hold the whole block.
        cut = begin;
        break;
      }

      if (cut <= 0) return "";

      const emitted = buffer.slice(0, cut);
      buffer = buffer.slice(cut);
      return redactSecrets(emitted);
    },

    flush(): string {
      const remaining = redactSecrets(buffer);
      buffer = "";
      return remaining;
    },
  };
}
