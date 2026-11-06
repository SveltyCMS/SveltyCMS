/**
 * @file tests/security-corpus/harness.ts
 * @description Executable red-team corpus targets.
 *
 * `cases.json` describes the attack payloads (data only — a case that is not
 * wired to a guard proves nothing). This module maps each `target` id to a real,
 * pure guard and defines the verdict convention used by
 * `tests/unit/security/red-team-corpus.test.ts`:
 *
 *   `true`  → the guard REJECTED the payload (unsafe input recognised)
 *   `false` → the guard ACCEPTED it (safe by that guard's contract)
 *
 * Every import here must resolve under the plain `vitest.config.ts` Node
 * environment: no `$app/*` runtime state, no `window`, no network.
 *
 * ### Features:
 * - URL / path guard (`isValidDashboardEndpoint`)
 * - XSS triage (`containsXssVector`)
 * - SVG markup scrubber (`sanitizeSvg`, vector-presence before vs. after)
 * - Prototype-key filter (`sanitizeObject`, compared as before/after)
 */

import { isValidDashboardEndpoint } from "@src/routes/(app)/dashboard/widget-sandbox";
import { sanitizeSvg } from "@src/utils/media/media-service.server";
import { containsXssVector, sanitizeObject } from "@utils/security/input-sanitizer";

/**
 * `sanitizeObject` drops `__proto__`/`constructor`/`prototype` keys when it
 * rebuilds an object. A rebuild that changes the serialized payload means the
 * guard rejected at least one key, at any depth.
 */
function prototypeKeysRejected(payload: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    // A prototype-key case must be a JSON document; an unparsable payload can
    // never reach the object walk, so treat it as rejected (unsafe/untestable).
    return true;
  }
  if (!parsed || typeof parsed !== "object") return true;
  return JSON.stringify(sanitizeObject(parsed)) !== JSON.stringify(parsed);
}

/**
 * `sanitizeSvg` is a scrubber, not a predicate. Any rewrite used to mean a
 * vector was found, but the parser-based allowlist also normalizes inert
 * markup (`<rect/>` → `<rect></rect>`), so compare semantics: reject only when
 * the payload carried an SVG vector and the sanitized output no longer does.
 */
const SVG_VECTOR_RE =
  /<(?:script|foreignobject|iframe|object|embed|style|animate|set)\b|(?:^|[\s"'/>])on[a-z]+\s*=|\bjavascript\s*:|\bdata\s*:/i;

function svgMarkupRejected(payload: string): boolean {
  if (!SVG_VECTOR_RE.test(payload)) return false;
  return !SVG_VECTOR_RE.test(sanitizeSvg(payload));
}

/**
 * Guard registry. Keys are referenced by `target` in `cases.json`; a case whose
 * target is missing here fails the corpus test (no silently skipped payloads).
 */
export const TARGETS: Record<string, (payload: string) => boolean> = {
  "dashboard-endpoint": (payload) => !isValidDashboardEndpoint(payload),
  "xss-vector": (payload) => containsXssVector(payload),
  "svg-markup": svgMarkupRejected,
  "prototype-keys": prototypeKeysRejected,
};
