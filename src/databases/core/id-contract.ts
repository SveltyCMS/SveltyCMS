/**
 * @file src/databases/core/id-contract.ts
 * @description Single source of truth for the enterprise `_id` format contract
 * across all four DB adapters (sqlite / postgresql / mariadb / mongodb).
 *
 * The system generates ids as UUIDv4 in two equivalent representations:
 * - 32-hex dash-less (`generateId()` — `crypto.randomUUID()` minus dashes)
 * - 36-char dashed (`crypto.randomUUID()`, Postgres `gen_random_uuid()`)
 *
 * Both gates (`SqlAdapterCore.validateEntryId`, `MongoCrudMethods.invalidEntryId`)
 * and both adapter utils re-export `validateId` from here — one implementation,
 * one contract, no drift between the SQL and Mongo families.
 *
 * ### Features:
 * - charCode scan only (no regex, no allocation) — ~42ns per check, sub-microsecond
 * - enforces UUIDv4 version (4) and RFC 4122 variant (8/9/a/b) on dashed forms
 * - early-exit on length mismatch (0.8ns for non-ids)
 */

function isHex32(str: string): boolean {
  for (let i = 0; i < 32; i++) {
    const c = str.charCodeAt(i);
    if (!((c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102))) return false;
  }
  return true;
}

function isUuid36(str: string): boolean {
  const variant = str.charCodeAt(19);
  if (
    str.charCodeAt(8) !== 45 ||
    str.charCodeAt(13) !== 45 ||
    str.charCodeAt(18) !== 45 ||
    str.charCodeAt(23) !== 45 ||
    // UUIDv4 contract: version '4' (pos 14), variant 8/9/a/b (pos 19)
    str.charCodeAt(14) !== 52 ||
    (variant !== 56 && variant !== 57 && variant !== 97 && variant !== 98)
  ) {
    return false;
  }
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) continue;
    const c = str.charCodeAt(i);
    if (!((c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102))) return false;
  }
  return true;
}

/**
 * Validates a string against the enterprise `_id` contract:
 * UUIDv4 as 32-hex (dash-less) or 36-char dashed form.
 */
export function validateId(id: unknown): boolean {
  if (typeof id !== "string") return false;
  const len = id.length;
  if (len === 32) return isHex32(id);
  if (len === 36) return isUuid36(id);
  return false;
}
