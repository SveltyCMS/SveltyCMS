#!/usr/bin/env bun
/**
 * @file scripts/lint/scan-remote-transport.ts
 * @description Reject a SvelteKit remote function whose transport contradicts its payload.
 *
 * ### Why this rule exists
 * `query()` is a GET: its arguments are serialised into the URL, so they land in
 * server/proxy access logs, browser history and devtools. `command()` is a POST
 * whose arguments travel in the body.
 *
 * The manual QA of the setup wizard found four `query()` registrations that
 * carried a database password, an SMTP password and a Redis password, plus a
 * state-changing `seedDatabase` call served over GET. No existing gate could see
 * it: `slop-scanner` models CSRF headers on `fetch()` calls, and the secret
 * scanners look for hardcoded values, not for a value crossing a URL. This rule
 * closes that class: the transport must match the payload.
 *
 * ### Rules
 * 1. A `query()` registration whose own argument type mentions a secret-shaped
 *    field (`password`, `secret`, `token`, `apiKey`, `privateKey`, `credential`,
 *    …) is an error — credentials must not travel in a URL.
 * 2. A `query()` registration whose name starts with a mutating verb (`seed`,
 *    `create`, `update`, `delete`, `remove`, `set`, `reset`, `install`, `save`,
 *    `publish`, `purge`, `upload`, `invite`, `complete`) is an error — a GET must
 *    not change state.
 *
 * Deliberate exemption: `// remote-transport-allow: <reason>` on the registration
 * line (or the line above) documents a case the rule cannot see, mirroring the
 * `catch-allow` convention used by `lint-silent-catch`.
 *
 * ### Features:
 * - pure `findRemoteTransportOffenses(files)` core for fixture tests
 * - registration-block extraction (paren-balanced), so only the payload type counts
 * - line-accurate offenses, deterministic order, no dependencies
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface RemoteTransportOffense {
  file: string;
  line: number;
  /** Exported const name of the offending remote function. */
  name: string;
  reason: string;
}

/** Field names that must never be sent as part of a GET query string. */
const SECRET_FIELD_PATTERN =
  /\b(password|passwd|passphrase|secret|apiKey|api_key|privateKey|private_key|credential|credentials|accessToken|access_token|refreshToken|refresh_token|smtpPassword|smtp_password|dbPassword|db_password)\b/i;

/** Registration names that imply a state change and therefore require POST. */
const MUTATING_NAME_PATTERN =
  /^\s*(seed|create|update|delete|remove|set|reset|install|save|publish|purge|upload|invite|complete|apply|migrate|write)/i;

const REGISTRATION_PATTERN = /export\s+const\s+([A-Za-z0-9_$]+)\s*=\s*query\s*\(/g;
const ALLOW_PATTERN = /remote-transport-allow\s*:\s*\S/;

/**
 * Extracts the argument text of a call whose opening paren ends at `openIndex`.
 * Returns the text inside the balanced parens (no re-parsing of string literals:
 * a remote registration's payload type carries no paren-balancing strings).
 */
function readCallArguments(source: string, openIndex: number): { text: string; end: number } {
  let depth = 0;
  let quote: string | null = null;
  let lineComment = false;
  let blockComment = false;
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (char === "\\") {
        i += 1; // skip the escaped character
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "/" && next === "/") {
      lineComment = true;
      i += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      i += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return { text: source.slice(openIndex + 1, i), end: i };
    }
  }
  return { text: source.slice(openIndex + 1), end: source.length };
}

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

/** A registration is exempt when the marker sits on its line or the line above. */
function isAllowed(source: string, registrationIndex: number): boolean {
  const line = lineOf(source, registrationIndex);
  const lines = source.split("\n");
  const current = lines[line - 1] ?? "";
  const previous = lines[line - 2] ?? "";
  return ALLOW_PATTERN.test(current) || ALLOW_PATTERN.test(previous);
}

/**
 * Pure core: scan `{ path, source }` pairs for transport/payload mismatches.
 * Only `.remote.ts` files are considered.
 */
export function findRemoteTransportOffenses(
  files: readonly { path: string; source: string }[],
): RemoteTransportOffense[] {
  const offenses: RemoteTransportOffense[] = [];

  for (const file of files) {
    if (!file.path.endsWith(".remote.ts")) continue;

    REGISTRATION_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null = REGISTRATION_PATTERN.exec(file.source);
    while (match) {
      const name = match[1];
      const openIndex = match.index + match[0].length - 1;
      const registrationIndex = match.index;
      const { text, end } = readCallArguments(file.source, openIndex);
      const line = lineOf(file.source, registrationIndex);

      // Scan the PARAMETER list (up to the arrow), never the handler body: a body
      // that merely reads `user.password` must not be mistaken for a payload field.
      const arrow = text.indexOf("=>");
      const signature = arrow >= 0 ? text.slice(0, arrow) : text;

      if (!isAllowed(file.source, registrationIndex)) {
        if (SECRET_FIELD_PATTERN.test(signature)) {
          offenses.push({
            file: file.path,
            line,
            name,
            reason:
              "query() is GET — its arguments land in the URL; a secret-shaped field must use command() (POST body)",
          });
        } else if (MUTATING_NAME_PATTERN.test(name)) {
          offenses.push({
            file: file.path,
            line,
            name,
            reason: "query() is GET — a mutating remote function must use command() (POST)",
          });
        }
      }

      REGISTRATION_PATTERN.lastIndex = Math.max(end, registrationIndex + 1);
      match = REGISTRATION_PATTERN.exec(file.source);
    }
  }

  return offenses;
}

/** Recursively collect `.remote.ts` sources under `root`. */
export function loadRemoteSources(root = process.cwd()): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stats = statSync(full);
      if (stats.isDirectory()) {
        if (entry === "node_modules" || entry === ".svelte-kit" || entry === "build") continue;
        walk(full);
      } else if (entry.endsWith(".remote.ts")) {
        out.push({
          path: relative(root, full).replace(/\\/g, "/"),
          source: readFileSync(full, "utf8"),
        });
      }
    }
  };
  walk(join(root, "src"));
  return out;
}

function main(): void {
  const offenses = findRemoteTransportOffenses(loadRemoteSources());
  if (offenses.length === 0) {
    console.log("✅ Remote transport: every credential-bearing or mutating remote uses command()");
    return;
  }
  for (const offense of offenses) {
    console.error(`❌ ${offense.file}:${offense.line} — ${offense.name}: ${offense.reason}`);
  }
  console.error(
    `\n${offenses.length} remote-transport violation(s). Use command() (POST) instead of query(), or add ` +
      "`// remote-transport-allow: <reason>` when the rule cannot see the real shape.",
  );
  process.exit(1);
}

if (import.meta.main) {
  main();
}
