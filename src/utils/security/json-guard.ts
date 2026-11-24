/**
 * @file src/utils/security/json-guard.ts
 * @description Pre-parser JSON depth, key-count, byte-size, and prototype-pollution guard.
 *
 * Features:
 * - O(N) single-pass pre-parse scanner for JSON nesting depth, key count, and payload size
 * - Rejects `__proto__`, `constructor`, and `prototype` keys before/during parsing
 * - Post-parse recursive assertion helper for already-parsed objects
 */

export interface JsonGuardOptions {
  /** Maximum allowed nesting depth (default: 12). */
  maxDepth?: number;
  /** Maximum allowed total object keys across the payload (default: 2000). */
  maxKeys?: number;
  /** Maximum allowed UTF-16 string length / byte ceiling (default: 1_048_576 = 1MB). */
  maxBytes?: number;
  /** Additional forbidden keys beyond `__proto__`, `constructor`, `prototype`. */
  forbiddenKeys?: ReadonlySet<string>;
}

export class JsonGuardError extends Error {
  readonly code:
    | "PAYLOAD_TOO_LARGE"
    | "MAX_DEPTH_EXCEEDED"
    | "MAX_KEYS_EXCEEDED"
    | "PROTOTYPE_POLLUTION"
    | "INVALID_JSON";

  constructor(code: JsonGuardError["code"], message: string) {
    super(message);
    this.name = "JsonGuardError";
    this.code = code;
  }
}

const DEFAULT_FORBIDDEN_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

/** Returns true if a key is a prototype-pollution vector. */
export function isPrototypePollutionKey(
  key: string,
  extraForbidden?: ReadonlySet<string>,
): boolean {
  return DEFAULT_FORBIDDEN_KEYS.has(key) || (extraForbidden ? extraForbidden.has(key) : false);
}

/**
 * Pre-parse O(N) scanner that enforces byte-size, nesting depth, key-count,
 * and prototype-pollution limits before `JSON.parse` allocates objects.
 */
export function guardJsonPayload(raw: string, options: JsonGuardOptions = {}): unknown {
  const maxDepth = options.maxDepth ?? 12;
  const maxKeys = options.maxKeys ?? 2000;
  const maxBytes = options.maxBytes ?? 1_048_576;
  const extraForbidden = options.forbiddenKeys;

  if (raw.length > maxBytes) {
    throw new JsonGuardError(
      "PAYLOAD_TOO_LARGE",
      `JSON payload exceeds maximum size (${raw.length} > ${maxBytes})`,
    );
  }

  let depth = 0;
  let keyCount = 0;
  let inString = false;
  let escaped = false;
  let stringStart = -1;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === 92 /* \ */) {
        escaped = true;
        continue;
      }
      if (ch === 34 /* " */) {
        inString = false;
        // Check if this string is an object key (followed by optional whitespace and ':')
        let j = i + 1;
        while (j < raw.length) {
          const next = raw.charCodeAt(j);
          if (next === 32 || next === 9 || next === 10 || next === 13) {
            j++;
            continue;
          }
          if (next === 58 /* : */) {
            keyCount++;
            if (keyCount > maxKeys) {
              throw new JsonGuardError(
                "MAX_KEYS_EXCEEDED",
                `JSON key count exceeds maximum (${maxKeys})`,
              );
            }
            const key = raw.slice(stringStart + 1, i);
            if (isPrototypePollutionKey(key, extraForbidden)) {
              throw new JsonGuardError("PROTOTYPE_POLLUTION", `Forbidden key "${key}" rejected`);
            }
          }
          break;
        }
      }
      continue;
    }

    if (ch === 34 /* " */) {
      inString = true;
      stringStart = i;
      continue;
    }

    if (ch === 123 /* { */ || ch === 91 /* [ */) {
      depth++;
      if (depth > maxDepth) {
        throw new JsonGuardError(
          "MAX_DEPTH_EXCEEDED",
          `JSON nesting depth exceeds maximum (${maxDepth})`,
        );
      }
      continue;
    }

    if (ch === 125 /* } */ || ch === 93 /* ] */) {
      depth = Math.max(0, depth - 1);
    }
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new JsonGuardError(
      "INVALID_JSON",
      err instanceof Error ? err.message : "Invalid JSON payload",
    );
  }
}

function walkSafeJson(
  node: unknown,
  depth: number,
  maxDepth: number,
  maxKeys: number,
  extraForbidden: ReadonlySet<string> | undefined,
  keyCount: number,
): number {
  if (depth > maxDepth) {
    throw new JsonGuardError(
      "MAX_DEPTH_EXCEEDED",
      `JSON nesting depth exceeds maximum (${maxDepth})`,
    );
  }
  if (node === null || typeof node !== "object") return keyCount;

  if (Array.isArray(node)) {
    const nextDepth = depth + 1;
    for (let i = 0; i < node.length; i++) {
      keyCount = walkSafeJson(node[i], nextDepth, maxDepth, maxKeys, extraForbidden, keyCount);
    }
    return keyCount;
  }

  const record = node as Record<string, unknown>;
  const nextDepth = depth + 1;
  for (const key in record) {
    if (!Object.hasOwn(record, key)) continue;
    keyCount++;
    if (keyCount > maxKeys) {
      throw new JsonGuardError("MAX_KEYS_EXCEEDED", `JSON key count exceeds maximum (${maxKeys})`);
    }
    if (
      key === "__proto__" ||
      key === "constructor" ||
      key === "prototype" ||
      (extraForbidden !== undefined && extraForbidden.has(key))
    ) {
      throw new JsonGuardError("PROTOTYPE_POLLUTION", `Forbidden key "${key}" rejected`);
    }
    const child = record[key];
    if (child !== null && typeof child === "object") {
      keyCount = walkSafeJson(child, nextDepth, maxDepth, maxKeys, extraForbidden, keyCount);
    }
  }
  return keyCount;
}

/**
 * Post-parse recursive guard for already-parsed objects/arrays.
 * Zero closure and zero `Object.keys` array allocation on the write hot path.
 */
export function assertSafeJsonObject(value: unknown, options: JsonGuardOptions = {}): void {
  if (value === null || typeof value !== "object") return;
  const maxDepth = options.maxDepth ?? 12;
  const maxKeys = options.maxKeys ?? 2000;
  walkSafeJson(value, 0, maxDepth, maxKeys, options.forbiddenKeys, 0);
}
