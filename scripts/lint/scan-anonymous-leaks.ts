/**
 * @file scripts/lint/scan-anonymous-leaks.ts
 * @description Fails when a handler an anonymous caller can reach returns a
 * sign-in link, a token, a password hash, an API key or another secret.
 *
 * The 2026-10-31 audit found two instances of one class:
 * - B1 `forgotPW` (src/routes/login/auth.remote.ts) answered with a live
 *   password-reset URL on every install without SMTP, so an unauthenticated
 *   visitor could reset the administrator password and sign in with it.
 * - N2 `sendMagicLinkForEmail` (src/databases/auth/magic-link.ts) built a
 *   `devLink` unconditionally and returned it in the result object — one
 *   spread away from the same takeover.
 *
 * Both are invisible to types, unit tests and review: the property is legal,
 * the handler is legal, only the COMBINATION of "no session" and "returns a
 * credential" is the vulnerability. This guard scans that combination
 * statically.
 *
 * Rule set
 * 1. Scope: every `.ts` under `src/routes/**` (server loads, actions,
 *    `+server.ts` endpoints, `.remote.ts` commands/queries) plus every
 *    `src/**\/*.remote.ts` outside the routes tree.
 * 2. Every exported handler (`load`, `GET`/`POST`/…, `actions.<name>`,
 *    `command()`/`query()`/`form()` consts) is ANONYMOUS unless a session or
 *    permission guard is reachable from it: `requireUser`, `requirePermission`,
 *    `requireSession`, `getSession`, `authenticate`, `assertAuthenticated`,
 *    `locals.user`, `locals.isAdmin`. Reachable means the handler body itself,
 *    the local helpers it calls and the exported functions it imports
 *    (including `const { x } = await import("…")`). There is no allowlist by
 *    route group: a false positive is a review conversation, a false negative
 *    is a takeover.
 * 3. Violation: such a handler reaches a returned/inlined `resetLink`,
 *    `magicLink`, `devLink`, `invitationUrl`, `invitationToken`,
 *    `passwordHash`, `apiKey`, `secret`, or a bare `token` property key — as
 *    an object key, a spread/shorthand, an assignment to a variable with that
 *    name, or inside a `redirect()`/`Response`/`JSON.stringify` payload.
 * 4. Allowed only under the double opt-in gate: BOTH
 *    `NODE_ENV !== "production"` AND a call-time read of a dedicated
 *    `ALLOW_*_IN_RESPONSE` flag. The gate may sit in the enclosing function or
 *    in a helper it calls (`isDevLinkResponseAllowed()`,
 *    `resetLinkExposureAllowed()`); a module-scope constant does NOT count,
 *    because it freezes on import and a dev-built bundle can be started as a
 *    production process. With only one of the two present the violation names
 *    the missing half.
 *
 * Usage:
 *   bun run scripts/lint/scan-anonymous-leaks.ts [--quiet]
 * Exit code: 0 on clean, 1 on any violation.
 *
 * Features:
 * - Pure `scanAnonymousLeaks()` core (unit-tested with fixture sources)
 * - Quote/comment/regex-aware brace matching (template interpolations stay code)
 * - Cross-file call following through the `@src/`, `@utils/`, `$lib/` aliases
 */

import { readFileSync, readdirSync } from "node:fs";
import type { Dirent } from "node:fs";
import { dirname, join, normalize } from "node:path";

export interface SourceFile {
  /** Project-relative POSIX path, e.g. `src/routes/login/auth.remote.ts`. */
  path: string;
  source: string;
}

export interface AnonymousLeak {
  file: string;
  line: number;
  key: string;
  handler: string;
  reason: string;
}

/** Keys that must never reach an anonymous response. */
export const SECRET_KEYS = [
  "resetLink",
  "magicLink",
  "devLink",
  "invitationUrl",
  "invitationToken",
  "passwordHash",
  "apiKey",
  "secret",
  "token",
] as const;

const GUARD_PATTERN =
  /\b(?:requireUser|requirePermission|requirePagePermission|requireSession|getSession|getAuthenticatedUser|getCurrentUser|authenticate|assertAuthenticated)\s*\(|\blocals\.(?:user|isAdmin)\b/;
const NODE_ENV_PATTERN = /\bNODE_ENV\s*!==?\s*["'`]production["'`]/;
const OPT_IN_PATTERN = /\bALLOW_[A-Z0-9_]*_IN_RESPONSE\b/;

const HANDLER_NAMES = new Set(["load", "GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);
const HANDLER_FACTORIES = /(?:^|[^.\w$])(?:command|query|form)\s*\(/;

/** Path aliases the app resolves (mirrors svelte.config.js / tsconfig paths). */
const ALIASES: ReadonlyArray<[string, string]> = [
  ["$lib/", "src/lib/"],
  ["@src/", "src/"],
  ["@utils/", "src/utils/"],
  ["@components/", "src/components/"],
  ["@widgets/", "src/widgets/"],
  ["@databases/", "src/databases/"],
  ["@services/", "src/services/"],
  ["@stores/", "src/stores/"],
  ["@plugins/", "src/plugins/"],
];

/**
 * Mirror of the runtime public allowlist (src/utils/hook-utils.ts:
 * PUBLIC_EXACT_ROUTES / PUBLIC_PREFIX_ROUTES / LOCALIZED_PUBLIC_REGEX). A route
 * that is NOT public is redirected to /login by handleAuthorization before the
 * handler runs, so its handlers are authentication-guaranteed by the hook.
 */
const PUBLIC_EXACT_ROUTES = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/setup",
  "/share",
  "/api/system/health",
  "/api/system/version",
  "/api/user/login",
  "/api/user/2fa/verify",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/oidc-logout",
  "/api/auth/oidc-login",
  "/api/auth/oidc-callback",
  "/api/auth/sso-providers",
  "/api/auth/frontchannel-logout",
  "/api/auth/backchannel-logout",
  "/api/preview",
  "/api/media/share",
  "/api/system/penalize-bounce",
  "/api/system/prewarm-route",
  "/api/security/csp-report",
  "/api/auth/saml/acs",
  "/api/auth/saml/login",
  "/api/auth/saml/slo",
  "/api/auth/saml/logout",
]);

const PUBLIC_PREFIX_ROUTES = [
  "/api/settings/public",
  "/api/theme/public",
  "/share",
  "/api/commerce/cart",
  "/api/commerce/quote",
  "/api/commerce/coupon",
  "/api/commerce/checkout",
  "/api/commerce/pay",
  "/api/commerce/confirm",
  "/api/commerce/panes",
  "/api/commerce/downloads",
  "/api/stripe/webhook",
  "/api/stripe/config",
  "/api/forms",
];

const LOCALIZED_PUBLIC_REGEX =
  /^\/(?!api(?:\/|$))[a-z]{2,5}(?:-[a-zA-Z]+)?\/(?:setup|login|register|forgot-password)(?:\/|$|\?)/;

const MAX_DEPTH = 4;
const BODY_SEARCH_LIMIT = 2000;

// ── Source masking ──────────────────────────────────────────────────────────

/**
 * Marks every character that is executable code with 1; comments, string
 * bodies and regex bodies stay 0. Template-literal interpolations count as
 * code, so `${`…`}` braces balance correctly.
 */
export function codeMask(source: string): Uint8Array {
  const mask = new Uint8Array(source.length);
  const modes: string[] = ["code"];
  const depths: number[] = [0];
  let prevSignificant = "";
  let i = 0;

  const regexAllowed = (prev: string): boolean =>
    prev === "" || "=(:,!&|?{};+-*%~^<>[]".includes(prev);

  while (i < source.length) {
    const mode = modes[modes.length - 1];
    const char = source[i];

    if (mode === "line") {
      if (char === "\n") modes.pop();
      i++;
      continue;
    }
    if (mode === "block") {
      if (char === "*" && source[i + 1] === "/") {
        modes.pop();
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (mode === "single" || mode === "double") {
      if (char === "\\") {
        i += 2;
        continue;
      }
      if ((mode === "single" && char === "'") || (mode === "double" && char === '"')) modes.pop();
      i++;
      continue;
    }
    if (mode === "template") {
      if (char === "\\") {
        i += 2;
        continue;
      }
      if (char === "`") {
        modes.pop();
        depths.pop();
        prevSignificant = "`";
        i++;
        continue;
      }
      if (char === "$" && source[i + 1] === "{") {
        modes.push("code");
        depths.push(0);
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (mode === "regex" || mode === "regex-class") {
      if (char === "\\") {
        i += 2;
        continue;
      }
      if (mode === "regex" && char === "[") {
        modes.push("regex-class");
        i++;
        continue;
      }
      if (mode === "regex-class" && char === "]") {
        modes.pop();
        i++;
        continue;
      }
      if (mode === "regex" && char === "/") {
        modes.pop();
        prevSignificant = "/";
        i++;
        continue;
      }
      if (char === "\n") modes.pop();
      i++;
      continue;
    }

    // code
    if (char === "/" && source[i + 1] === "/") {
      modes.push("line");
      i += 2;
      continue;
    }
    if (char === "/" && source[i + 1] === "*") {
      modes.push("block");
      i += 2;
      continue;
    }
    if (char === "'") {
      modes.push("single");
      i++;
      continue;
    }
    if (char === '"') {
      modes.push("double");
      i++;
      continue;
    }
    if (char === "`") {
      modes.push("template");
      depths.push(0);
      i++;
      continue;
    }
    if (char === "/" && regexAllowed(prevSignificant)) {
      modes.push("regex");
      i++;
      continue;
    }
    if (char === "{" || char === "}") {
      const closeTemplateExpr =
        char === "}" && depths[depths.length - 1] === 0 && modes[modes.length - 2] === "template";
      if (closeTemplateExpr) {
        modes.pop();
        depths.pop();
        i++;
        continue;
      }
      if (char === "{") depths[depths.length - 1]++;
      else depths[depths.length - 1] = Math.max(0, depths[depths.length - 1] - 1);
    }

    mask[i] = 1;
    if (!/\s/.test(char)) prevSignificant = char;
    i++;
  }

  return mask;
}

/** Matching brackets: `{` → `}` and `(` → `)`, keyed by the opening index. */
function bracketPairs(source: string, mask: Uint8Array): Map<number, number> {
  const pairs = new Map<number, number>();
  const stack: number[] = [];
  for (let i = 0; i < source.length; i++) {
    if (mask[i] !== 1) continue;
    const char = source[i];
    if (char === "{" || char === "(") stack.push(i);
    else if (char === "}" || char === ")") {
      const open = stack.pop();
      if (open !== undefined) pairs.set(open, i);
    }
  }
  return pairs;
}

/** Body brace of a `function`/`method` declaration, starting at its `(`. */
function bodyAfterParams(
  source: string,
  mask: Uint8Array,
  pairs: Map<number, number>,
  openParen: number,
): number {
  const close = pairs.get(openParen);
  if (close === undefined) return -1;
  for (let i = close + 1; i < Math.min(source.length, close + 400); i++) {
    if (mask[i] !== 1) continue;
    if (source[i] === ";") return -1;
    if (source[i] === "{") return pairs.has(i) ? i : -1;
  }
  return -1;
}

// ── File model ──────────────────────────────────────────────────────────────

interface FunctionBlock {
  name: string;
  exported: boolean;
  /** Index of the opening body brace. */
  bodyStart: number;
  /** Index of the closing body brace. */
  bodyEnd: number;
  /** Index of the start of the declaration. */
  start: number;
  /** Declaration text from the start up to the body brace. */
  header: string;
  parent: FunctionBlock | null;
  entry: boolean;
  handlerName: string;
  /** `export const actions = { … }` — the container, not a handler itself. */
  container: boolean;
}

interface ImportBinding {
  localName: string;
  importedName: string;
  specifier: string;
}

interface FileModel {
  path: string;
  source: string;
  mask: Uint8Array;
  bracePairs: Map<number, number>;
  blocks: FunctionBlock[];
  byName: Map<string, FunctionBlock>;
  imports: ImportBinding[];
  skipRanges: Array<[number, number]>;
}

interface RawBlock {
  name: string;
  exported: boolean;
  start: number;
  bodyStart: number;
  container: boolean;
}

/**
 * Body brace of a declaration starting at `from`: the first `{` whose
 * preceding text contains an arrow or `function` keyword. Parameter and type
 * literals are skipped as a whole, and a statement that ends before a body is
 * found returns -1.
 */
function findBodyBrace(
  source: string,
  mask: Uint8Array,
  pairs: Map<number, number>,
  from: number,
  regionFrom = from,
  limit = BODY_SEARCH_LIMIT,
): number {
  const end = Math.min(source.length, from + limit);
  for (let i = from; i < end; i++) {
    if (mask[i] !== 1) continue;
    const char = source[i];
    if (char === ";") return -1;
    if (char !== "{") continue;
    const close = pairs.get(i);
    if (close === undefined) continue;
    const region = source.slice(regionFrom, i);
    if (region.includes("=>") || /\bfunction\b/.test(region)) return i;
    i = close;
  }
  return -1;
}

function firstCodeChar(source: string, mask: Uint8Array, from: number): number {
  for (let i = from; i < Math.min(source.length, from + 200); i++) {
    if (mask[i] === 1 && !/\s/.test(source[i])) return i;
  }
  return -1;
}

function rawBlocks(source: string, mask: Uint8Array, pairs: Map<number, number>): RawBlock[] {
  const out: RawBlock[] = [];
  const push = (block: RawBlock): void => {
    if (block.bodyStart < 0) return;
    if (out.some((existing) => existing.name === block.name && existing.start === block.start))
      return;
    out.push(block);
  };

  // 1. Function declarations: `[export] [async] function name(…) {`
  const declRe =
    /(?:^|\n)([ \t]*)(export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*(?:<[^>\n]*>)?\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = declRe.exec(source))) {
    const start = match.index + (match[0].startsWith("\n") ? 1 : 0);
    const bodyStart = bodyAfterParams(source, mask, pairs, match.index + match[0].length - 1);
    push({
      name: match[3],
      exported: match[2]?.startsWith("export") ?? false,
      start,
      bodyStart,
      container: false,
    });
  }

  // 2. Variable declarations: `[export] const name = …`
  const varRe =
    /(?:^|\n)[ \t]*(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*/g;
  while ((match = varRe.exec(source))) {
    const start = match.index + 1;
    const afterEquals = match.index + match[0].length;
    const first = firstCodeChar(source, mask, afterEquals);
    if (first === -1) continue;
    if (source[first] === "{" && pairs.has(first)) {
      // Object literal: only `actions` is a handler container.
      push({
        name: match[2],
        exported: match[1]?.startsWith("export") ?? false,
        start,
        bodyStart: first,
        container: match[2] === "actions",
      });
      continue;
    }
    drawDecl(start, match[2], match[1]?.startsWith("export") ?? false, afterEquals);
  }

  // 3. Object property handlers: `name: async (…) => {`
  const propRe =
    /(?:^|\n)[ \t]*([A-Za-z_$][\w$]*)\s*:\s*(?:async\s+)?(?:function\s*\*?\s*)?(?:\([^)\n]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=\n{]+)?=>\s*\{/g;
  while ((match = propRe.exec(source))) {
    const start = match.index + 1;
    const bodyStart = match.index + match[0].length - 1;
    if (source[bodyStart] !== "{" || mask[bodyStart] !== 1) continue;
    if (!pairs.has(bodyStart)) continue;
    push({ name: match[1], exported: false, start, bodyStart, container: false });
  }

  return out;

  function drawDecl(start: number, name: string, exported: boolean, from: number): void {
    const bodyStart = findBodyBrace(source, mask, pairs, from, start);
    push({ name, exported, start, bodyStart, container: false });
  }
}

function buildModel(path: string, source: string): FileModel {
  const mask = codeMask(source);
  const pairs = bracketPairs(source, mask);
  const blocks: FunctionBlock[] = [];

  for (const raw of rawBlocks(source, mask, pairs)) {
    const bodyEnd = pairs.get(raw.bodyStart);
    if (bodyEnd === undefined) continue;
    blocks.push({
      name: raw.name,
      exported: raw.exported,
      bodyStart: raw.bodyStart,
      bodyEnd,
      start: raw.start,
      header: source.slice(raw.start, raw.bodyStart),
      parent: null,
      entry: false,
      handlerName: raw.name,
      container: raw.container,
    });
  }

  blocks.sort((a, b) => a.start - b.start || b.bodyEnd - a.bodyEnd);

  // Parents: smallest enclosing block.
  for (const block of blocks) {
    let parent: FunctionBlock | null = null;
    for (const candidate of blocks) {
      if (candidate === block) continue;
      if (candidate.start < block.start && candidate.bodyEnd > block.bodyEnd) {
        if (!parent || candidate.bodyEnd - candidate.start < parent.bodyEnd - parent.start)
          parent = candidate;
      }
    }
    block.parent = parent;
  }

  // Entry points.
  for (const block of blocks) {
    if (block.container) continue;
    const inActions = (block.parent?.container ?? false) && block.parent?.name === "actions";
    if (block.exported && HANDLER_NAMES.has(block.name)) {
      block.entry = true;
      block.handlerName = block.name;
    } else if (block.exported && HANDLER_FACTORIES.test(block.header)) {
      block.entry = true;
      block.handlerName = block.name;
    } else if (inActions) {
      block.entry = true;
      block.handlerName = `actions.${block.name}`;
    }
  }

  const byName = new Map<string, FunctionBlock>();
  for (const block of blocks) if (!byName.has(block.name)) byName.set(block.name, block);

  return {
    path,
    source,
    mask,
    bracePairs: pairs,
    blocks,
    byName,
    imports: parseImports(source),
    skipRanges: typeRanges(source, pairs, mask),
  };
}

/** `interface`/`type` bodies declare shapes, never responses. */
function typeRanges(
  source: string,
  pairs: Map<number, number>,
  mask: Uint8Array,
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re =
    /(?:^|\n)[ \t]*(?:export\s+)?(?:interface|type)\s+[A-Za-z_$][\w$]*(?:\s*<[^>\n]*>)?[^\n{;]*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const open = match.index + match[0].length - 1;
    if (source[open] !== "{" || mask[open] !== 1) continue;
    const close = pairs.get(open);
    if (close !== undefined) ranges.push([open, close]);
  }
  return ranges;
}

function parseImports(source: string): ImportBinding[] {
  const bindings: ImportBinding[] = [];
  const push = (clause: string, specifier: string): void => {
    for (const raw of clause.split(",")) {
      const part = raw.trim();
      if (!part || part.startsWith("type ")) continue;
      const [importedPart, aliasPart] = part.split(/\s+as\s+/);
      const importedName = importedPart?.trim();
      if (!importedName || !/^[A-Za-z_$][\w$]*$/.test(importedName)) continue;
      bindings.push({ localName: aliasPart?.trim() || importedName, importedName, specifier });
    }
  };

  // Clauses are bounded (`[^{}]`) so a missing brace can never make one match
  // span half the file and swallow the declarations in between.
  const staticRe = /import\s*\{([^{}]{1,600}?)\}\s*from\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = staticRe.exec(source))) push(match[1], match[2]);

  const defaultRe =
    /import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{([^{}]{1,600}?)\}\s*)?from\s*["']([^"']+)["']/g;
  while ((match = defaultRe.exec(source))) {
    const localName = match[1];
    const specifier = match[3];
    if (localName && specifier) bindings.push({ localName, importedName: "default", specifier });
    if (match[2] && specifier) push(match[2], specifier);
  }

  const dynamicRe =
    /(?:const|let|var)\s*\{([^{}]{1,600}?)\}\s*=\s*await\s+import\(\s*["']([^"']+)["']\s*\)/g;
  while ((match = dynamicRe.exec(source))) push(match[1], match[2]);

  return bindings;
}

function resolveSpecifier(specifier: string, fromPath: string): string | null {
  let target = specifier;
  if (specifier.startsWith(".")) {
    target = normalize(join(dirname(fromPath), specifier)).replace(/\\/g, "/");
  } else {
    const alias = ALIASES.find(([prefix]) => specifier.startsWith(prefix));
    if (!alias) return null;
    target = `${alias[1]}${specifier.slice(alias[0].length)}`;
  }
  target = target.replace(/\.js$/, ".ts");
  if (!target.endsWith(".ts")) target = `${target}.ts`;
  return target;
}

// ── Core ────────────────────────────────────────────────────────────────────

function lineOf(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (source[i] === "\n") line++;
  return line;
}

function enclosingBlock(model: FileModel, index: number): FunctionBlock | null {
  let found: FunctionBlock | null = null;
  for (const block of model.blocks) {
    if (block.bodyStart < index && block.bodyEnd > index) {
      if (!found || block.bodyEnd - block.bodyStart < found.bodyEnd - found.bodyStart)
        found = block;
    }
  }
  return found;
}

function isSkipped(model: FileModel, index: number): boolean {
  return model.skipRanges.some(([start, end]) => index >= start && index <= end);
}

interface ScanContext {
  models: Map<string, FileModel>;
  readExtra?: (path: string) => string | null;
}

function modelFor(context: ScanContext, path: string): FileModel | null {
  const cached = context.models.get(path);
  if (cached) return cached;
  if (!context.readExtra) return null;
  const source = context.readExtra(path);
  if (source === null) return null;
  const model = buildModel(path, source);
  context.models.set(path, model);
  return model;
}

interface ReachableBlock {
  model: FileModel;
  block: FunctionBlock;
}

/** The handler plus every helper it can call, optionally across files. */
function reachable(
  context: ScanContext,
  model: FileModel,
  entry: FunctionBlock,
  crossFile: boolean,
): ReachableBlock[] {
  const found: ReachableBlock[] = [];
  const seen = new Set<string>();
  const queue: Array<{ model: FileModel; block: FunctionBlock; depth: number }> = [
    { model, block: entry, depth: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const key = `${current.model.path}:${current.block.bodyStart}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ model: current.model, block: current.block });
    if (current.depth >= MAX_DEPTH) continue;

    const body = current.model.source.slice(current.block.bodyStart, current.block.bodyEnd + 1);
    const called = new Set<string>();
    for (const call of body.matchAll(/\b([A-Za-z_$][\w$]*)\s*(?:<[^>\n]*>)?\s*\(/g)) {
      if (call[1]) called.add(call[1]);
    }

    for (const name of called) {
      const local = current.model.byName.get(name);
      if (local && local !== current.block) {
        queue.push({ model: current.model, block: local, depth: current.depth + 1 });
        continue;
      }
      if (!crossFile) continue;
      const binding = current.model.imports.find((entryImport) => entryImport.localName === name);
      if (!binding) continue;
      const target = resolveSpecifier(binding.specifier, current.model.path);
      if (!target) continue;
      const targetModel = modelFor(context, target);
      if (!targetModel) continue;
      const exported = targetModel.byName.get(binding.importedName);
      if (exported) queue.push({ model: targetModel, block: exported, depth: current.depth + 1 });
    }
  }

  return found;
}

interface Gate {
  nodeEnv: boolean;
  optIn: boolean;
}

/** Gate text of a block: its own body plus the helpers it calls (depth 2). */
function gateOf(context: ScanContext, model: FileModel, block: FunctionBlock | null): Gate {
  if (!block) return { nodeEnv: false, optIn: false };
  const texts: string[] = [];
  const seen = new Set<string>();

  const visit = (currentModel: FileModel, currentBlock: FunctionBlock, depth: number): void => {
    const key = `${currentModel.path}:${currentBlock.bodyStart}`;
    if (seen.has(key) || depth > 2) return;
    seen.add(key);
    const body = currentModel.source.slice(currentBlock.bodyStart, currentBlock.bodyEnd + 1);
    texts.push(body);
    for (const call of body.matchAll(/\b([A-Za-z_$][\w$]*)\s*(?:<[^>\n]*>)?\s*\(/g)) {
      const name = call[1];
      if (!name) continue;
      const local = currentModel.byName.get(name);
      if (local && local !== currentBlock) visit(currentModel, local, depth + 1);
      const binding = currentModel.imports.find((entryImport) => entryImport.localName === name);
      if (!binding) continue;
      const target = resolveSpecifier(binding.specifier, currentModel.path);
      if (!target) continue;
      const targetModel = modelFor(context, target);
      const imported = targetModel?.byName.get(binding.importedName);
      if (targetModel && imported) visit(targetModel, imported, depth + 1);
    }
  };

  visit(model, block, 0);
  const text = texts.join("\n");
  return { nodeEnv: NODE_ENV_PATTERN.test(text), optIn: OPT_IN_PATTERN.test(text) };
}

function isDeclarationLine(line: string): boolean {
  const trimmed = line.trim();
  if (/^(?:const|let|var)\s*\{/.test(trimmed)) return true;
  if (/^\(\s*\{/.test(trimmed)) return true;
  if (/^(?:export\s+)?(?:interface|type)\s/.test(trimmed)) return true;
  return false;
}

interface Occurrence {
  index: number;
  key: string;
}

/**
 * Occurrence shapes that actually hand a value to the caller:
 * - a key/shorthand inside an object literal that is returned (`return { … }`,
 *   `=> ({ … })`), including nested objects of that payload,
 * - `return key;`
 * - a key inside a `redirect()` / `Response` / `JSON.stringify` payload.
 * A `secret:` in a configuration object or a `const token = …` binding is not
 * an exposure and must not fail the gate.
 */
function returnedRoots(model: FileModel, block: FunctionBlock): Array<[number, number]> {
  const roots: Array<[number, number]> = [];
  for (let i = block.bodyStart; i <= block.bodyEnd; i++) {
    if (model.mask[i] !== 1 || model.source[i] !== "{") continue;
    const close = model.bracePairs.get(i);
    if (close === undefined) continue;
    const before = model.source.slice(Math.max(0, i - 120), i).trimEnd();
    if (
      /(?:^|[^\w$])return$/.test(before) ||
      /=>\s*\($/.test(before) ||
      /return\s+[\w$.]*\($/.test(before)
    ) {
      roots.push([i, close]);
    }
  }
  return roots;
}

function occurrences(model: FileModel, block: FunctionBlock): Occurrence[] {
  const found: Occurrence[] = [];
  const roots = returnedRoots(model, block);

  const body = model.source.slice(block.bodyStart, block.bodyEnd + 1);
  let offset = block.bodyStart;

  for (const line of body.split("\n")) {
    const lineStart = offset;
    offset += line.length + 1;
    if (isDeclarationLine(line)) continue;

    const payloadLine = /(?:redirect\s*\(|new\s+Response|JSON\.stringify)/.test(line);

    for (const key of SECRET_KEYS) {
      const patterns: RegExp[] = [
        new RegExp(`(?:^|[{,])\\s*${key}\\s*:`),
        new RegExp(`[{,]\\s*${key}\\s*[,}]`),
        new RegExp(`^\\s*${key}\\s*[,}]`),
      ];
      if (payloadLine) patterns.push(new RegExp(`\\b${key}\\b`));
      patterns.push(new RegExp(`\\breturn\\s+${key}\\s*[;}]`));

      let hit: number | null = null;
      for (const re of patterns) {
        const match = re.exec(line);
        if (!match) continue;
        const relative = match.index + match[0].indexOf(key);
        const absolute = lineStart + relative;
        if (model.mask[absolute] !== 1) continue;
        if (isSkipped(model, absolute)) continue;
        hit = absolute;
        break;
      }
      if (hit === null) continue;

      if (model.source[hit - 1] === "$" || model.source[hit - 2] === "$") continue; // `${token}`
      const inReturned = roots.some(([start, end]) => hit > start && hit < end);
      if (!inReturned && !payloadLine) continue;

      // `token` is only a disclosure when it is a freshly minted or raw token,
      // never when it echoes a caller-supplied value (invite_token, redirect
      // state) or carries a step-up proof bound to the caller's own session.
      if (key === "token") {
        const tail = line.slice(line.indexOf(key) + key.length);
        const initializer =
          new RegExp(`(?:const|let|var)\\s+${key}\\s*=\\s*([^;\\n]*)`).exec(
            model.source.slice(block.bodyStart, block.bodyEnd + 1),
          )?.[1] ?? "";
        const minted = /(?:createToken|rawToken|tokenHash|issueToken|generateToken)/;
        if (!minted.test(tail) && !minted.test(initializer)) continue;
      }

      found.push({ index: hit, key });
    }
  }

  return found;
}

/** Route path of a `src/routes` file, with groups removed and the leaf stripped. */
export function routePathOf(filePath: string): string | null {
  if (!filePath.startsWith("src/routes/")) return null;
  const rest = filePath
    .slice("src/routes/".length)
    .replace(/\/(?:\+[a-z]+\.(?:server\.)?ts|\+[a-z]+)/, "");
  const segments = rest
    .split("/")
    .filter((segment) => segment.length > 0 && !/^\(.*\)$/.test(segment));
  return `/${segments.join("/")}`;
}

export function isPublicRoutePath(routePath: string): boolean {
  if (PUBLIC_EXACT_ROUTES.has(routePath)) return true;
  if (PUBLIC_PREFIX_ROUTES.some((prefix) => routePath.startsWith(prefix))) return true;
  return LOCALIZED_PUBLIC_REGEX.test(routePath);
}

/**
 * True when the SvelteKit hook already guarantees a session for this file.
 * `.remote.ts` handlers are excluded: the request classifier treats
 * `/_app/remote/**` as public transport on purpose ("remote functions are
 * self-guarding", src/utils/hook-utils.ts classifyRequest), so only an
 * in-function guard counts there.
 */
export function isHookAuthenticated(filePath: string): boolean {
  if (filePath.endsWith(".remote.ts")) return false;
  const routePath = routePathOf(filePath);
  if (routePath === null) return false;
  return !isPublicRoutePath(routePath);
}

function reasonFor(gate: Gate): string {
  const missing: string[] = [];
  if (!gate.nodeEnv) missing.push('NODE_ENV !== "production"');
  if (!gate.optIn) missing.push("ALLOW_*_IN_RESPONSE opt-in flag");
  if (missing.length === 2) {
    return `anonymous handler exposes a secret without the double opt-in gate (missing ${missing[0]} and ${missing[1]})`;
  }
  if (missing.length === 1) {
    return `anonymous handler exposes a secret with only one half of the double opt-in gate (missing ${missing[0]})`;
  }
  return "";
}

/**
 * Pure core — fixtures in `tests/unit/scripts/scan-anonymous-leaks.test.ts`.
 */
export function scanAnonymousLeaks(
  files: SourceFile[],
  readExtra?: (path: string) => string | null,
): AnonymousLeak[] {
  const models = new Map<string, FileModel>();
  for (const file of files) models.set(file.path, buildModel(file.path, file.source));
  const context: ScanContext = { models, readExtra };

  const leaks: AnonymousLeak[] = [];
  const seen = new Set<string>();

  for (const model of models.values()) {
    if (isHookAuthenticated(model.path)) continue; // the hook already demands a session
    for (const entry of model.blocks) {
      if (!entry.entry) continue;
      // A guard in a shared library helper says nothing about THIS handler, so
      // the guard decision follows only the handler's own file. The occurrence
      // scan is the opposite: it must follow imports, or the magic-link
      // devLink (built one module away) would be invisible.
      const guardScope = reachable(context, model, entry, false)
        .map((item) => item.model.source.slice(item.block.bodyStart, item.block.bodyEnd + 1))
        .join("\n");
      if (GUARD_PATTERN.test(guardScope)) continue; // authenticated: out of scope

      const scope = reachable(context, model, entry, true);
      for (const item of scope) {
        for (const occurrence of occurrences(item.model, item.block)) {
          const owner = enclosingBlock(item.model, occurrence.index) ?? item.block;
          const reason = reasonFor(gateOf(context, item.model, owner));
          if (!reason) continue;
          const line = lineOf(item.model.source, occurrence.index);
          const dedupe = `${item.model.path}:${line}:${occurrence.key}:${entry.handlerName}`;
          if (seen.has(dedupe)) continue;
          seen.add(dedupe);
          leaks.push({
            file: item.model.path,
            line,
            key: occurrence.key,
            handler: entry.handlerName,
            reason,
          });
        }
      }
    }
  }

  return leaks.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));
}

/** Handlers a scan would visit — for the CI summary line. */
export function countHandlers(files: SourceFile[]): number {
  let count = 0;
  for (const file of files)
    count += buildModel(file.path, file.source).blocks.filter((b) => b.entry).length;
  return count;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function collectTsFiles(dir: string, out: string[] = []): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectTsFiles(full, out);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

function main(): void {
  const quiet = process.argv.includes("--quiet") || process.argv.includes("--ci");
  const root = process.cwd();
  const toPosix = (path: string): string => path.replace(/\\/g, "/");
  const relative = (full: string): string => toPosix(full.slice(root.length + 1));

  const targets = new Set<string>();
  for (const full of collectTsFiles(join(root, "src", "routes"))) targets.add(relative(full));
  for (const full of collectTsFiles(join(root, "src"))) {
    if (toPosix(full).endsWith(".remote.ts")) targets.add(relative(full));
  }

  const files: SourceFile[] = [...targets]
    .sort()
    .map((path) => ({ path, source: readFileSync(join(root, path), "utf8") }));

  const onDisk = new Set(files.map((file) => file.path));
  const readExtra = (path: string): string | null => {
    if (onDisk.has(path)) return null; // already modelled
    try {
      return readFileSync(join(root, path), "utf8");
    } catch {
      return null;
    }
  };

  const leaks = scanAnonymousLeaks(files, readExtra);
  const handlerCount = countHandlers(files);

  if (leaks.length === 0) {
    if (!quiet) {
      console.log(
        `✅ anonymous leak guard: no secret or sign-in link in ${handlerCount} handler(s) across ${files.length} file(s).`,
      );
    }
    return;
  }

  console.log(`❌ anonymous leak guard: ${leaks.length} violation(s)`);
  for (const leak of leaks) {
    console.log(
      `${leak.file}:${leak.line} key=${leak.key} handler=${leak.handler} reason=${leak.reason}`,
    );
  }
  console.log(
    '\n   Gate the value with BOTH NODE_ENV !== "production" AND an ALLOW_*_IN_RESPONSE flag read at call time, or omit the key.',
  );
  process.exitCode = 1;
}

if (import.meta.main) main();
