/**
 * @file scripts/security/scan-secret-misuse.ts
 * @description Static analysis scanner that detects secret misuse patterns
 * in source code — forbidden key access, hardcoded credentials, and
 * accidental secret exposure in non-server files.
 *
 * ### Features:
 * - **High-entropy detection**: Shannon entropy analysis to reduce false
 *   positives by distinguishing actual secrets from variable names/placeholders.
 * - **Known key patterns**: Matches AWS, GitHub, Stripe, JWT, DB connection
 *   strings, SendGrid, Resend, npm and generic API key formats for
 *   high-confidence detection.
 * - **Whole-file pass**: High-value patterns are re-run over the normalised
 *   file text (`"a" + "b"` joined, `\r` stripped) so a secret split across
 *   lines cannot evade the per-line pass.
 * - **Comment awareness**: A small lexer tracks line and block comments,
 *   quoted strings and template literals, so the `//` inside `https://…` never
 *   hides a token.
 * - **Incremental scanning**: Only re-scans files modified since last commit
 *   (use `--full` to force full scan).
 * - **Full-repo scope**: scans `src`, `scripts`, `config/collections`, `.github`
 *   and root build configs; generated `config/private*.ts` is excluded (it is
 *   the operator's local secret file, not committed code).
 *
 * Usage:
 *   bun run scripts/security/scan-secret-misuse.ts           # incremental (changed files only)
 *   bun run scripts/security/scan-secret-misuse.ts --full    # full codebase scan
 *   bun run scripts/security/scan-secret-misuse.ts --strict  # fail on medium/high-confidence findings
 */

import { execSync } from "node:child_process";
import { existsSync, globSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { relative } from "node:path";

const ROOT = process.cwd();
const ENTROPY_THRESHOLD = 4.0; // Shannon entropy threshold for flagging

/** Source roots scanned in full mode (tests are intentionally excluded — fixtures are not leaks). */
const SCAN_ROOTS = ["src", "scripts", "config/collections", ".github"] as const;
/** Root-level build/config files that can embed a token. */
const SCAN_ROOT_FILES = [
  "vite.config.ts",
  "svelte.config.js",
  "playwright.config.ts",
  "vitest.config.ts",
  "vitest.dom.config.ts",
  "path-aliases.ts",
  "package.json",
] as const;

// ─── Secret name lists ──────────────────────────────────────────────────────

const BOOTSTRAP_SECRETS = [
  "DB_TYPE",
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "DB_RETRY_ATTEMPTS",
  "DB_RETRY_DELAY",
  "JWT_SECRET_KEY",
  "ENCRYPTION_KEY",
  "MULTI_TENANT",
  "DEMO",
];

const PRIVATE_SECRETS = [
  "RATE_LIMIT_SECRET",
  "SAML_CLIENT_SECRET_VERIFIER",
  "SAML_ENCRYPTION_KEY",
  "SAML_JWT_SIGNING_PRIVATE_KEY",
  "SAML_JWT_SIGNING_PUBLIC_KEY",
  "SMTP_PASS",
  "SMTP_PASSWORD",
  "GOOGLE_CLIENT_SECRET",
  "REDIS_PASSWORD",
  "TEST_API_SECRET",
  "CF_API_TOKEN",
  "MAPBOX_API_TOKEN",
  "SECRET_MAPBOX_API_TOKEN",
  "TWITCH_TOKEN",
  "TIKTOK_TOKEN",
  "PREVIEW_SECRET",
];

/**
 * Canonical list of every secret env/key name this scanner treats as private.
 * Exported so the production-bundle scanner can reuse exactly this set.
 */
export const ALL_FORBIDDEN_KEYS: readonly string[] = [
  ...new Set([
    ...BOOTSTRAP_SECRETS,
    ...PRIVATE_SECRETS,
    "SMTP_PASS",
    "SMTP_PASSWORD",
    "REDIS_PASSWORD",
    "SAML_CLIENT_SECRET_VERIFIER",
    "GOOGLE_CLIENT_SECRET",
    "CF_API_TOKEN",
    "CLOUDFLARE_API_TOKEN",
    "AWS_SECRET_ACCESS_KEY",
    "S3_SECRET_ACCESS_KEY",
    "R2_SECRET_ACCESS_KEY",
  ]),
];

/** Pre-compiled single regex for all forbidden keys (avoids one RegExp allocation per key per line). */
const FORBIDDEN_PRIVATE_SETTING_RE = new RegExp(
  `getPrivateSetting(?:Sync)?\\s*\\(\\s*["'\`](${ALL_FORBIDDEN_KEYS.join("|")})["'\`]`,
  "i",
);

// ─── Known secret format patterns ───────────────────────────────────────────

interface KeyPattern {
  name: string;
  regex: RegExp;
  /** If true, ONLY flag when the match has high entropy (reduces false positives) */
  requireEntropy: boolean;
}

const KNOWN_KEY_PATTERNS: KeyPattern[] = [
  // AWS Access Key ID
  { name: "AWS Access Key", regex: /(?:AKIA|ASIA)[0-9A-Z]{16}/g, requireEntropy: false },
  // AWS Secret Access Key (base64-like, ~40 chars). The `.` in the lookbehind
  // keeps dotted identifiers and URL paths (`schemas.xmlsoap.org/ws/...`) out.
  {
    name: "AWS Secret Key",
    regex: /(?<![A-Za-z0-9/+.])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+])/g,
    requireEntropy: true,
  },
  // GitHub Personal Access Token (classic)
  { name: "GitHub Token (classic)", regex: /ghp_[0-9a-zA-Z]{36}/g, requireEntropy: false },
  // GitHub PAT (fine-grained)
  {
    name: "GitHub Token (fine-grained)",
    regex: /github_pat_[0-9a-zA-Z_]{50,}/g,
    requireEntropy: false,
  },
  // Stripe live secret key
  { name: "Stripe Live Secret", regex: /sk_live_[0-9a-zA-Z]{24,}/g, requireEntropy: false },
  // Stripe live publishable
  { name: "Stripe Live Publishable", regex: /pk_live_[0-9a-zA-Z]{24,}/g, requireEntropy: false },
  // Generic API key patterns (alphanumeric, 32+ chars)
  {
    name: "Generic API Key (32+)",
    regex: /(?<![A-Za-z0-9])[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_-])/g,
    requireEntropy: true,
  },
  // JWT tokens
  {
    name: "JWT Token",
    regex: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g,
    requireEntropy: false,
  },
  // Private key blocks
  {
    name: "Private Key Block",
    regex: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
    requireEntropy: false,
  },
  // Generic hex secrets (64+ hex chars)
  {
    name: "Hex Secret (64+)",
    regex: /(?<![A-Fa-f0-9])[A-Fa-f0-9]{64,}(?![A-Fa-f0-9])/g,
    requireEntropy: true,
  },
  // Slack webhook URLs
  {
    name: "Slack Webhook",
    regex: /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_]+/g,
    requireEntropy: false,
  },
  // Google API key
  { name: "Google API Key", regex: /AIza[0-9A-Za-z_-]{35}/g, requireEntropy: false },
  // OpenAI / Anthropic API keys (sk-... / sk-ant-... / sk-proj-...)
  {
    name: "OpenAI/Anthropic API Key",
    regex: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g,
    requireEntropy: false,
  },
  // Slack tokens (xoxb- / xoxp- / xoxa- / xoxr- / xoxs-)
  {
    name: "Slack Token",
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
    requireEntropy: false,
  },
  // Hugging Face tokens
  { name: "Hugging Face Token", regex: /\bhf_[A-Za-z0-9]{20,}/g, requireEntropy: false },
  // DB connection string with embedded credentials
  {
    name: "DB Connection String",
    regex:
      /(?:postgres|postgresql|mysql|mariadb|mongodb(?:\+srv)?|redis):\/\/[^:\s"'`]+:[^@\s"'`]+@/gi,
    requireEntropy: false,
  },
  // SendGrid API key (SG.<22>.<43>)
  {
    name: "SendGrid API Key",
    regex: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g,
    requireEntropy: false,
  },
  // Resend API key (re_<24+>)
  { name: "Resend API Key", regex: /\bre_[A-Za-z0-9]{24,}\b/g, requireEntropy: false },
  // npm automation token (npm_<36>)
  { name: "npm Token", regex: /\bnpm_[A-Za-z0-9]{36}\b/g, requireEntropy: false },
];

/** Sticky matcher for a string literal split across a `+` (also across newlines). */
const SPLIT_CONCAT_RE = /(["'`])\s*\+\s*\1/y;

/**
 * Placeholder docs examples (`user:pass@`) and runtime template interpolation
 * (`${user}:${encoded}@`) are not hardcoded credentials.
 */
function isPlaceholderConnectionString(matched: string): boolean {
  return (
    matched.includes("${") ||
    /\/\/(?:user|username|usr|admin|root):(?:pass|password|pwd|secret)\b/i.test(matched)
  );
}

/**
 * Shared gates for a known-key match: safe strings, placeholders, entropy and
 * the minimum lengths that keep the generic patterns from firing on prose.
 */
function shouldReportKnownKey(name: string, matched: string, requireEntropy: boolean): boolean {
  if (isKnownSafe(matched)) return false;
  if (name === "DB Connection String" && isPlaceholderConnectionString(matched)) return false;
  if (requireEntropy && !isHighEntropy(matched)) return false;
  if (name === "Generic API Key (32+)" && matched.length < 40) return false;
  if (name === "Hex Secret (64+)" && matched.length < 72) return false;
  return true;
}

// ─── Hardcoded credential comparison patterns (Rule 6) ──────────────────────

const SECRET_IDENT = "(?:password|secret|token|passphrase|passwd)";

/** `<secret-ident> === "literal"` / `!== "literal"`. */
const COMPARISON_POSTFIX_RE = new RegExp(
  `(?:^|[^.\\w])${SECRET_IDENT}\\s*[!=]==?\\s*["'\`]([^"'\`]{4,})["'\`]`,
  "i",
);

/** Yoda form: `"literal" === <secret-ident>`. */
const COMPARISON_YODA_RE = new RegExp(
  `["'\`]([^"'\`]{4,})["'\`]\\s*[!=]==?\\s*${SECRET_IDENT}\\b`,
  "i",
);

/** `<secret-ident>.includes("literal")` / `.startsWith("literal")`. */
const SECRET_METHOD_LITERAL_RE = new RegExp(
  `\\b${SECRET_IDENT}\\s*\\.\\s*(?:includes|startsWith)\\s*\\(\\s*["'\`]([^"'\`]{4,})["'\`]`,
  "i",
);

/** Password-hash prefixes (`$argon2…`, `$2b$…`) are algorithm markers, not credentials. */
const HASH_MARKER_RE = /^\$(?:argon2|2[abxy]|scrypt|pbkdf2)/i;

/** First hardcoded literal compared against a secret-looking identifier, if any. */
function findHardcodedComparison(line: string): string | null {
  const postfix = COMPARISON_POSTFIX_RE.exec(line);
  const yoda = COMPARISON_YODA_RE.exec(line);
  const method = SECRET_METHOD_LITERAL_RE.exec(line);
  return postfix?.[1] ?? yoda?.[1] ?? method?.[1] ?? null;
}

/** Typeof guards, Svelte templates, type annotations and hash markers are not backdoors. */
function isSafeComparisonLiteral(value: string, line: string): boolean {
  return (
    value === "string" ||
    value === "number" ||
    value === "boolean" ||
    /^<[a-z]/.test(value) ||
    line.trim().endsWith(">") ||
    isKnownSafe(value) ||
    HASH_MARKER_RE.test(value)
  );
}

// ─── Exposure patterns (console.log / logger.*, hardcoded) ──────────────────

const EXPOSURE_PATTERNS: { pattern: RegExp; name: string }[] = [
  {
    pattern: /(?:console|logger)\.(log|warn|error|debug|info|trace)\([^)]*DB_PASSWORD/i,
    name: "log output with DB_PASSWORD",
  },
  {
    pattern: /(?:console|logger)\.(log|warn|error|debug|info|trace)\([^)]*JWT_SECRET/i,
    name: "log output with JWT_SECRET_KEY",
  },
  {
    pattern: /(?:console|logger)\.(log|warn|error|debug|info|trace)\([^)]*ENCRYPTION_KEY/i,
    name: "log output with ENCRYPTION_KEY",
  },
  {
    pattern: /(?:console|logger)\.(log|warn|error|debug|info|trace)\([^)]*TEST_API_SECRET/i,
    name: "log output with TEST_API_SECRET",
  },
  {
    pattern: /(?:console|logger)\.(log|warn|error|debug|info|trace)\([^)]*sck_/i,
    name: "log output with API key",
  },
  { pattern: /['"`]sck_[A-Za-z0-9_-]{40,}['"`]/, name: "hardcoded API key (sck_)" },
];

/** Paths allowed to reference the default local benchmark test secret. */
const BENCHMARK_SECRET_ALLOWLIST = [
  "scripts/benchmark-matrix/",
  "scripts/runs/",
  "scripts/setup-system.ts",
  "scripts/security/",
  "scripts/test/",
  "tests/benchmarks/",
  "tests/e2e/",
  "tests/integration/",
  "tests/unit/",
];

const HARDCODED_BENCHMARK_SECRET = /SVELTYCMS_TEST_SECRET_2026/;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Finding {
  file: string;
  line: number;
  message: string;
  confidence: "high" | "medium" | "low";
}

/** Adds a finding unless an identical one was already reported for that line. */
function addFinding(findings: Finding[], finding: Finding): void {
  const isDuplicate = findings.some(
    (f) => f.file === finding.file && f.line === finding.line && f.message === finding.message,
  );
  if (!isDuplicate) findings.push(finding);
}

// ─── Entropy Calculation ────────────────────────────────────────────────────

/**
 * Shannon entropy of a string. Returns 0-8 (bits per character).
 * High entropy (>4.5) suggests random data (keys/tokens).
 * Low entropy (<3.5) suggests structured text or repeated patterns.
 */
function shannonEntropy(str: string): number {
  if (str.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of str) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / str.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Returns true if a string looks like a real secret (high entropy, mixed chars).
 */
function isHighEntropy(str: string, threshold: number = ENTROPY_THRESHOLD): boolean {
  const entropy = shannonEntropy(str);
  // Also check character diversity: secrets have mixed case + digits + special chars
  const hasUpper = /[A-Z]/.test(str);
  const hasLower = /[a-z]/.test(str);
  const hasDigit = /[0-9]/.test(str);
  const hasSpecial = /[^A-Za-z0-9]/.test(str);
  const diversityScore = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;

  return entropy >= threshold && diversityScore >= 3 && str.length >= 16;
}

/** Known safe strings that look like secrets but aren't (common test fixtures, etc). */
const SAFE_STRINGS = new Set([
  "SVELTYCMS_TEST_SECRET_2026",
  "sveltycms_test_secret",
  "test_secret_placeholder",
  "0000000000000000000000000000000000000000",
  "abcdefghijklmnopqrstuvwxyz0123456789",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  // integration-harness.ts test defaults (intentionally hardcoded fallbacks)
  "Integration-Test-JWT-Secret-Key-2026-pad-to-32chars!!",
  "Integration-Encryption-Key-2026-32ch",
  // Public SAML 2.0 binding URNs — protocol identifiers, not secrets.
  "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
  "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
]);

function isKnownSafe(str: string): boolean {
  return SAFE_STRINGS.has(str) || /^0{32,}$/.test(str) || /^x{8,}$/.test(str);
}

// ─── File Collection ────────────────────────────────────────────────────────

function isExcludedPath(p: string): boolean {
  const s = p.replace(/\\/g, "/");
  return (
    s.includes("node_modules") ||
    s.includes("paraglide") ||
    s.endsWith(".d.ts") ||
    // Generated local secret file — never committed, so scanning it only creates noise.
    s.endsWith("config/private.ts") ||
    s.endsWith("config/private.test.ts") ||
    s.includes("/test-results/") ||
    s.includes("/coverage/")
  );
}

function collectSourceFiles(dir: string): string[] {
  return globSync(`${dir}/**/*.{ts,svelte,js,yml,yaml}`, {
    exclude: (p) => isExcludedPath(String(p)),
  });
}

function getChangedFiles(): string[] {
  try {
    // Working tree (unstaged) + staged + last commit
    const seen = new Set<string>();
    const addUnique = (output: string) => {
      for (const f of output
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)) {
        if (f && !seen.has(f)) {
          seen.add(f);
        }
      }
    };

    // Unstaged changes
    try {
      addUnique(
        execSync("git diff --name-only --diff-filter=ACM", { encoding: "utf8", cwd: ROOT }),
      );
    } catch {
      /* ok */
    }
    // Staged changes
    try {
      addUnique(
        execSync("git diff --name-only --cached --diff-filter=ACM", {
          encoding: "utf8",
          cwd: ROOT,
        }),
      );
    } catch {
      /* ok */
    }
    // Untracked files
    try {
      addUnique(
        execSync("git ls-files --others --exclude-standard", { encoding: "utf8", cwd: ROOT }),
      );
    } catch {
      /* ok */
    }
    // Changed since last commit
    try {
      addUnique(
        execSync("git diff --name-only HEAD --diff-filter=ACM", { encoding: "utf8", cwd: ROOT }),
      );
    } catch {
      /* ok */
    }

    return [...seen];
  } catch {
    return [];
  }
}

export function isServerFile(filePath: string): boolean {
  const n = filePath.replace(/\\/g, "/");
  return (
    n.endsWith(".server.ts") ||
    n.endsWith(".server.js") ||
    n.endsWith(".ws.ts") ||
    n.endsWith(".remote.ts") ||
    n.includes("/hooks/") ||
    n.includes("/api/") ||
    n.includes("/databases/") ||
    n.includes("/services/") ||
    // Server-side tooling, fixtures and generated collection configs legitimately
    // read bootstrap secrets via env/config helpers; they are not client bundles.
    n.startsWith("scripts/") ||
    n.startsWith("tests/") ||
    n.startsWith("config/")
  );
}

// ─── Scanning ───────────────────────────────────────────────────────────────

/**
 * Marks which character indexes of each line sit inside a JS/TS comment. It
 * tracks block comments, quoted strings and template literals across lines, so
 * the `//` in `https://…` (or in `"a // b"`) never suppresses a real finding.
 */
function computeCommentMasks(lines: readonly string[]): Uint8Array[] {
  const masks: Uint8Array[] = [];
  let inBlockComment = false;
  let inTemplate = false;

  for (const line of lines) {
    const mask = new Uint8Array(line.length);
    let quote: '"' | "'" | null = null;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      const next = line[i + 1];

      if (inBlockComment) {
        mask[i] = 1;
        if (ch === "*" && next === "/") {
          if (i + 1 < line.length) mask[i + 1] = 1;
          inBlockComment = false;
          i += 1;
        }
        continue;
      }

      if (inTemplate) {
        if (ch === "\\") i += 1;
        else if (ch === "`") inTemplate = false;
        continue;
      }

      if (quote) {
        if (ch === "\\") i += 1;
        else if (ch === quote) quote = null;
        continue;
      }

      if (ch === "/" && next === "/") {
        mask.fill(1, i);
        break;
      }
      if (ch === "/" && next === "*") {
        mask[i] = 1;
        if (i + 1 < line.length) mask[i + 1] = 1;
        inBlockComment = true;
        i += 1;
        continue;
      }
      if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "`") inTemplate = true;
    }

    masks.push(mask);
  }

  return masks;
}

interface NormalisedSource {
  text: string;
  /** 1-based original line of each surviving character (normalisation drops chars). */
  lineAt: Int32Array;
  /** 1 when the surviving character sat inside a comment in the original source. */
  commented: Uint8Array;
}

/**
 * Joins `"a" + "b"` (including across newlines) and strips `\r`, while keeping
 * the original line and comment state of every surviving character so findings
 * stay pinpointed and suppressed comments stay suppressed.
 */
function normaliseWholeFile(
  content: string,
  commentMasks: readonly Uint8Array[],
): NormalisedSource {
  const src = content.replace(/\r/g, "");
  const chars: string[] = [];
  const lineAt = new Int32Array(src.length);
  const commented = new Uint8Array(src.length);
  let lineIdx = 0;
  let col = 0;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "\n") {
      lineIdx += 1;
      col = 0;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      SPLIT_CONCAT_RE.lastIndex = i;
      const join = SPLIT_CONCAT_RE.exec(src);
      if (join) {
        for (const skipped of join[0]) {
          if (skipped === "\n") {
            lineIdx += 1;
            col = 0;
          } else {
            col += 1;
          }
        }
        i += join[0].length - 1;
        continue;
      }
    }
    const at = chars.length;
    lineAt[at] = lineIdx + 1;
    commented[at] = commentMasks[lineIdx]?.[col] ?? 0;
    chars.push(ch);
    col += 1;
  }

  return {
    text: chars.join(""),
    lineAt: lineAt.subarray(0, chars.length),
    commented: commented.subarray(0, chars.length),
  };
}

/** Re-runs every known-key pattern over the whole file so splits cannot evade them. */
function scanWholeFile(
  content: string,
  relPath: string,
  commentMasks: readonly Uint8Array[],
  findings: Finding[],
): void {
  const { text, lineAt, commented } = normaliseWholeFile(content, commentMasks);
  if (text.length === 0) return;

  for (const { name, regex, requireEntropy } of KNOWN_KEY_PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (commented[match.index] === 1) continue;
      if (!shouldReportKnownKey(name, match[0], requireEntropy)) continue;
      addFinding(findings, {
        file: relPath,
        line: lineAt[match.index] ?? 1,
        message: `Hardcoded ${name} detected`,
        confidence: requireEntropy ? "medium" : "high",
      });
    }
  }
}

function scanLine(
  line: string,
  lineNum: number,
  relPath: string,
  isServer: boolean,
  isAllowlistedForSecrets: boolean,
  commentMask: Uint8Array,
  findings: Finding[],
): void {
  // ── Rule 1: Forbidden key access in non-server files ────────────────────
  if (!isServer && line.includes("getPrivateSetting")) {
    // One pre-compiled alternation (non-global, so `.exec` never carries
    // `lastIndex` across lines) instead of a fresh RegExp per key per line.
    const forbidden = FORBIDDEN_PRIVATE_SETTING_RE.exec(line);
    if (forbidden) {
      findings.push({
        file: relPath,
        line: lineNum,
        message: `${forbidden[1]}: private key accessed in non-server file`,
        confidence: "high",
      });
    }
  }

  // ── Rule 2: Exposure patterns (console.log, hardcoded) ──────────────────
  for (const { pattern, name } of EXPOSURE_PATTERNS) {
    if (pattern.test(line)) {
      findings.push({
        file: relPath,
        line: lineNum,
        message: `Potential ${name}`,
        confidence: "high",
      });
    }
  }

  // ── Rule 3: Known key patterns (skip for test-infra files) ───────────────
  if (!isAllowlistedForSecrets) {
    for (const { name, regex, requireEntropy } of KNOWN_KEY_PATTERNS) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(line)) !== null) {
        const matched = match[0];
        if (commentMask[match.index] === 1) continue;
        if (!shouldReportKnownKey(name, matched, requireEntropy)) continue;
        findings.push({
          file: relPath,
          line: lineNum,
          message: `Hardcoded ${name} detected`,
          confidence: requireEntropy ? "medium" : "high",
        });
      }
    }
  }

  // ── Rule 4: Hardcoded benchmark secret ──────────────────────────────────
  if (!isAllowlistedForSecrets) {
    if (HARDCODED_BENCHMARK_SECRET.test(line)) {
      findings.push({
        file: relPath,
        line: lineNum,
        message: "Hardcoded SVELTYCMS_TEST_SECRET_2026 outside benchmark allowlist",
        confidence: "high",
      });
    }
  }

  // ── Rule 5: Entropy-based generic scan (skip for test-infra files) ───────
  if (!isAllowlistedForSecrets) {
    const assignMatch = line.match(
      /(?:const|let|var)\s+[A-Z_][A-Z0-9_]{2,}\s*[:=]\s*["'`]([^"'`]{24,})["'`]/,
    );
    if (assignMatch) {
      const value = assignMatch[1];
      const varName = line.match(/(?:const|let|var)\s+([A-Z_][A-Z0-9_]{2,})/)?.[1] ?? "";
      if (!isKnownSafe(value) && isHighEntropy(value) && value.length >= 30) {
        // Skip URLs, CSS class strings, regex patterns, and prose/natural language with whitespace
        const isUrl = value.startsWith("https://") || value.startsWith("http://");
        const isCssClass = /^[a-z][-a-z0-9/]+ /.test(value);
        const isProse = /\s/.test(value);
        const isRegex =
          value.includes("(?:") ||
          value.includes("(?=") ||
          value.includes("\\d+") ||
          value.includes("\\[") ||
          value.includes("(?<");
        if (
          !isUrl &&
          !isCssClass &&
          !isProse &&
          !isRegex &&
          !value.startsWith("{") &&
          !value.startsWith("[")
        ) {
          findings.push({
            file: relPath,
            line: lineNum,
            message: `High-entropy string assigned to \`${varName}\` — possible hardcoded secret`,
            confidence: "low",
          });
        }
      }
    }
  }

  // ── Rule 6: Hardcoded credentials in comparisons (backdoor detection) ─────
  if (!isAllowlistedForSecrets) {
    const value = findHardcodedComparison(line);
    if (value !== null && !isSafeComparisonLiteral(value, line)) {
      findings.push({
        file: relPath,
        line: lineNum,
        message: `Hardcoded credential in comparison: \`${value}\` — possible auth bypass backdoor`,
        confidence: "high",
      });
    }
  }
}

function scanText(content: string, relPath: string, findings: Finding[]): void {
  const isServer = isServerFile(relPath);
  const isAllowlistedForSecrets = BENCHMARK_SECRET_ALLOWLIST.some((p) => relPath.includes(p));
  const lines = content.replace(/\r/g, "").split("\n");
  const commentMasks = computeCommentMasks(lines);

  for (let i = 0; i < lines.length; i++) {
    // Skip comment-only / blank lines for speed
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    scanLine(
      lines[i],
      i + 1,
      relPath,
      isServer,
      isAllowlistedForSecrets,
      commentMasks[i],
      findings,
    );
  }

  if (!isAllowlistedForSecrets) {
    scanWholeFile(content, relPath, commentMasks, findings);
  }
}

/** Scans an in-memory source string — the testable entry point. */
export function scanSource(content: string, relPath: string): Finding[] {
  const findings: Finding[] = [];
  scanText(content, relPath.replace(/\\/g, "/"), findings);
  return findings;
}

async function scanFile(
  filePath: string,
  fileIndex: number,
  total: number,
  findings: Finding[],
): Promise<void> {
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return; // binary or unreadable
  }

  const relPath = relative(ROOT, filePath).replace(/\\/g, "/");
  scanText(content, relPath, findings);

  // Progress
  if ((fileIndex + 1) % 50 === 0 || fileIndex === total - 1) {
    process.stderr.write(`\r  Scanning... ${fileIndex + 1}/${total}`);
  }
}

// ─── Report ─────────────────────────────────────────────────────────────────

function printReport(findings: Finding[], elapsedMs: number, isIncremental: boolean): void {
  process.stderr.write("\n");

  if (findings.length === 0) {
    const mode = isIncremental ? "incrementally" : "fully";
    console.log(`  ✅ No secret misuse detected (${mode} scanned in ${elapsedMs}ms).\n`);
    return;
  }

  // Group by confidence
  const high = findings.filter((f) => f.confidence === "high");
  const medium = findings.filter((f) => f.confidence === "medium");
  const low = findings.filter((f) => f.confidence === "low");

  console.log(`  ❌ ${findings.length} finding(s) in ${elapsedMs}ms:`);
  console.log(`     HIGH: ${high.length}  MEDIUM: ${medium.length}  LOW: ${low.length}`);
  console.log("");

  const byFile = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = byFile.get(f.file) || [];
    list.push(f);
    byFile.set(f.file, list);
  }

  for (const [file, list] of byFile) {
    console.log(`  ${file}:`);
    for (const f of list) {
      const icon = f.confidence === "high" ? "🔴" : f.confidence === "medium" ? "🟡" : "⚪";
      console.log(`    ${icon} L${f.line}: ${f.message}`);
    }
  }
  console.log("");
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const startTime = performance.now();
  const strict = process.argv.includes("--strict");
  const fullScan = process.argv.includes("--full") || process.argv.includes("--all");

  console.log("🔍 Secret Misuse Scanner\n");

  // Determine file set
  let files: string[] = [];
  let isIncremental = false;

  if (!fullScan) {
    const changed = getChangedFiles();
    // Filter to scannable source/config paths.
    const sourceFiles = changed.filter((f) => {
      const n = f.replace(/\\/g, "/");
      return (
        SCAN_ROOTS.some((root) => n.startsWith(`${root}/`)) ||
        (SCAN_ROOT_FILES as readonly string[]).includes(n)
      );
    });
    if (sourceFiles.length > 0 && sourceFiles.length < 500) {
      files = sourceFiles
        .filter(
          (f) =>
            (SCAN_ROOT_FILES as readonly string[]).includes(f) ||
            (/\.(ts|svelte|js|ya?ml)$/.test(f) && !f.endsWith(".d.ts")),
        )
        .filter((f) => !isExcludedPath(f))
        .filter((f) => {
          try {
            return existsSync(f);
          } catch {
            return false;
          }
        });
      isIncremental = true;
      console.log(`  Incremental scan: ${files.length} changed file(s)`);
    } else {
      files = [];
    }
  }

  if (files.length === 0) {
    const sourceFiles = SCAN_ROOTS.flatMap((root) => collectSourceFiles(root));
    const rootFiles = SCAN_ROOT_FILES.filter((f) => existsSync(f));
    files = [...sourceFiles, ...rootFiles];
    console.log(`  Full scan: ${files.length} file(s)`);
  }

  const findings: Finding[] = [];

  // Scan files in parallel chunks of 32 (I/O-bound workload)
  const BATCH_SIZE = 32;
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((file, offset) => scanFile(file, i + offset, files.length, findings)),
    );
  }

  const elapsedMs = Math.round(performance.now() - startTime);
  printReport(findings, elapsedMs, isIncremental);

  if (strict && findings.filter((f) => f.confidence !== "low").length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(2);
  });
}
