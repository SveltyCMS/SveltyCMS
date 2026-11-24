/**
 * @file src/utils/security/query-filter-guard.ts
 * @description Query filter ReDoS and wildcard-density guard.
 *
 * Features:
 * - Rejects raw `$regex` operators unless explicitly enabled
 * - Detects catastrophic backtracking / nested quantifier patterns in regex strings
 * - Caps leading and total wildcard density in `LIKE` / glob filter patterns
 */

export interface QueryFilterGuardOptions {
  /** Allow `$regex` operators when validated (default: false). */
  allowRegex?: boolean;
  /** Maximum allowed regex pattern length (default: 128). */
  maxRegexLength?: number;
  /** Maximum allowed wildcard characters (`%` or `*`) in a LIKE filter (default: 4). */
  maxWildcards?: number;
  /** Allow leading wildcards (`%foo` / `*foo`) in LIKE filters (default: false). */
  allowLeadingWildcard?: boolean;
}

export class QueryFilterGuardError extends Error {
  readonly code:
    | "REGEX_DISABLED"
    | "REDOS_PATTERN"
    | "REGEX_TOO_LONG"
    | "WILDCARD_DENSITY_EXCEEDED"
    | "LEADING_WILDCARD_DISALLOWED";

  constructor(code: QueryFilterGuardError["code"], message: string) {
    super(message);
    this.name = "QueryFilterGuardError";
    this.code = code;
  }
}

// Detects nested quantifiers such as (a+)+, (a*)+, (a+)*, ([a-z]+)+, (a|aa)+
const NESTED_QUANTIFIER_RE = /\([^)]*[+*][^)]*\)[+*?]|\([^)]*\|[^)]*\)[+*]/;
const REPEATED_QUANTIFIER_RE = /[+*?]\s*[+*]/;

/** Validates a regex pattern against length and ReDoS heuristics. */
export function validateRegexPattern(pattern: string, options: QueryFilterGuardOptions = {}): void {
  const maxLen = options.maxRegexLength ?? 128;
  if (pattern.length > maxLen) {
    throw new QueryFilterGuardError(
      "REGEX_TOO_LONG",
      `Regex pattern exceeds maximum length (${pattern.length} > ${maxLen})`,
    );
  }
  if (NESTED_QUANTIFIER_RE.test(pattern) || REPEATED_QUANTIFIER_RE.test(pattern)) {
    throw new QueryFilterGuardError(
      "REDOS_PATTERN",
      "Regex pattern contains nested or repeated quantifiers (ReDoS risk)",
    );
  }
}

/** Validates a LIKE / wildcard filter string against leading and excessive wildcards. */
export function validateWildcardDensity(
  pattern: string,
  options: QueryFilterGuardOptions = {},
): void {
  const maxWildcards = options.maxWildcards ?? 4;
  const allowLeading = options.allowLeadingWildcard ?? false;

  if (!allowLeading && (pattern.startsWith("%") || pattern.startsWith("*"))) {
    throw new QueryFilterGuardError(
      "LEADING_WILDCARD_DISALLOWED",
      "Leading wildcards are disallowed in filter patterns",
    );
  }

  let count = 0;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "%" || ch === "*") {
      count++;
      if (count > maxWildcards) {
        throw new QueryFilterGuardError(
          "WILDCARD_DENSITY_EXCEEDED",
          `Filter pattern exceeds maximum wildcard count (${maxWildcards})`,
        );
      }
    }
  }
}

/** Recursively validates a query filter object for `$regex` and `LIKE` / `$like` operators. */
export function guardQueryFilter(
  filter: Record<string, unknown>,
  options: QueryFilterGuardOptions = {},
): void {
  const allowRegex = options.allowRegex ?? false;

  function walk(node: unknown): void {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) walk(node[i]);
      return;
    }

    const record = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      if (key === "$regex") {
        if (!allowRegex) {
          throw new QueryFilterGuardError("REGEX_DISABLED", "Raw $regex filters are disabled");
        }
        if (typeof value === "string") {
          validateRegexPattern(value, options);
        } else if (value instanceof RegExp) {
          validateRegexPattern(value.source, options);
        }
        continue;
      }

      if ((key === "$like" || key === "like" || key === "$ilike") && typeof value === "string") {
        validateWildcardDensity(value, options);
        continue;
      }

      walk(value);
    }
  }

  walk(filter);
}
