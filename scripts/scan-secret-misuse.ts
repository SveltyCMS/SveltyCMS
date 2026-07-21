/**
 * @file scripts/scan-secret-misuse.ts
 * @description Static analysis scanner that detects secret misuse patterns
 * in source code — forbidden key access, hardcoded credentials, and
 * accidental secret exposure in non-server files.
 *
 * ### Features:
 * - **High-entropy detection**: Shannon entropy analysis to reduce false
 *   positives by distinguishing actual secrets from variable names/placeholders.
 * - **Known key patterns**: Matches AWS, GitHub, Stripe, JWT, and generic
 *   API key formats for high-confidence detection.
 * - **Incremental scanning**: Only re-scans files modified since last commit
 *   (use `--full` to force full scan).
 *
 * Usage:
 *   bun run scripts/scan-secret-misuse.ts           # incremental (changed files only)
 *   bun run scripts/scan-secret-misuse.ts --full    # full codebase scan
 *   bun run scripts/scan-secret-misuse.ts --strict  # fail on any finding
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { globSync } from "glob";

const ROOT = process.cwd();
const ENTROPY_THRESHOLD = 4.0; // Shannon entropy threshold for flagging

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

const ALL_FORBIDDEN_KEYS = [...BOOTSTRAP_SECRETS, ...PRIVATE_SECRETS];

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
  // AWS Secret Access Key (base64-like, ~40 chars)
  {
    name: "AWS Secret Key",
    regex: /(?<![A-Za-z0-9/+])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+])/g,
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
];

// ─── Exposure patterns (console.log, hardcoded) ─────────────────────────────

const EXPOSURE_PATTERNS: { pattern: RegExp; name: string }[] = [
  {
    pattern: /console\.(log|warn|error|debug|info)\([^)]*DB_PASSWORD/i,
    name: "console with DB_PASSWORD",
  },
  {
    pattern: /console\.(log|warn|error|debug|info)\([^)]*JWT_SECRET/i,
    name: "console with JWT_SECRET_KEY",
  },
  {
    pattern: /console\.(log|warn|error|debug|info)\([^)]*ENCRYPTION_KEY/i,
    name: "console with ENCRYPTION_KEY",
  },
  { pattern: /console\.(log|warn|error|debug|info)\([^)]*sck_/i, name: "console with API key" },
  { pattern: /['"`]sck_[A-Za-z0-9_-]{40,}['"`]/, name: "hardcoded API key (sck_)" },
];

/** Paths allowed to reference the default local benchmark test secret. */
const BENCHMARK_SECRET_ALLOWLIST = [
  "scripts/benchmark-matrix/",
  "scripts/integration-harness.ts",
  "scripts/setup-system.ts",
  "scripts/security/auth.ts",
  "scripts/security/scanner.ts",
  "scripts/security-audit.ts",
  "scripts/scan-secret-misuse.ts",
  "scripts/test-doctor.ts",
  "scripts/run-e2e.ts",
  "tests/benchmarks/",
  "tests/e2e/",
  "tests/integration/",
  "tests/unit/",
];

const HARDCODED_BENCHMARK_SECRET = /SVELTYCMS_TEST_SECRET_2026/;

// ─── Types ──────────────────────────────────────────────────────────────────

interface Finding {
  file: string;
  line: number;
  message: string;
  confidence: "high" | "medium" | "low";
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
  // integration-harness.ts test defaults (intentionally hardcoded fallbacks)
  "Integration-Test-JWT-Secret-Key-2026-pad-to-32chars!!",
  "Integration-Encryption-Key-2026-32ch",
]);

function isKnownSafe(str: string): boolean {
  return SAFE_STRINGS.has(str) || /^0{32,}$/.test(str) || /^x{8,}$/.test(str);
}

// ─── File Collection ────────────────────────────────────────────────────────

function collectSourceFiles(dir: string): string[] {
  return globSync(`${dir}/**/*.{ts,svelte,js}`, {
    nodir: true,
    ignore: ["**/node_modules/**", "**/paraglide/**"],
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

function isServerFile(filePath: string): boolean {
  const n = filePath.replace(/\\/g, "/");
  return (
    n.endsWith(".server.ts") ||
    n.endsWith(".server.js") ||
    n.endsWith(".ws.ts") ||
    n.endsWith(".remote.ts") ||
    n.includes("/hooks/") ||
    n.includes("/api/") ||
    n.includes("/databases/") ||
    n.includes("/services/")
  );
}

// ─── Scanning ───────────────────────────────────────────────────────────────

function scanLine(
  line: string,
  lineNum: number,
  relPath: string,
  isServer: boolean,
  isAllowlistedForSecrets: boolean,
  findings: Finding[],
): void {
  // ── Rule 1: Forbidden key access in non-server files ────────────────────
  if (!isServer) {
    for (const key of ALL_FORBIDDEN_KEYS) {
      const regex = new RegExp(`getPrivateSetting(Sync)?\\s*\\(\\s*["'\`]${key}["'\`]`, "gi");
      if (regex.test(line)) {
        findings.push({
          file: relPath,
          line: lineNum,
          message: `${key}: private key accessed in non-server file`,
          confidence: "high",
        });
      }
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
        if (isKnownSafe(matched)) continue;
        const before = line.slice(0, match.index);
        if (/\/\//.test(before.split("\n").pop() ?? "")) continue;
        if (requireEntropy && !isHighEntropy(matched)) continue;
        if (name === "Generic API Key (32+)" && matched.length < 40) continue;
        if (name === "Hex Secret (64+)" && matched.length < 72) continue;
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
        if (!value.startsWith("{") && !value.startsWith("[")) {
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

  const lines = content.split("\n");
  const isServer = isServerFile(filePath);
  const relPath = relative(ROOT, filePath).replace(/\\/g, "/");
  const isAllowlistedForSecrets = BENCHMARK_SECRET_ALLOWLIST.some((p) => relPath.includes(p));

  for (let i = 0; i < lines.length; i++) {
    // Skip comment-only / blank lines for speed
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    scanLine(lines[i], i + 1, relPath, isServer, isAllowlistedForSecrets, findings);
  }

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
    // Filter to only source files
    const sourceFiles = changed.filter((f) => f.startsWith("src/") || f.startsWith("scripts/"));
    if (sourceFiles.length > 0 && sourceFiles.length < 500) {
      files = sourceFiles
        .filter((f) => /\.(ts|svelte|js)$/.test(f) && !f.endsWith(".d.ts"))
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
    const srcFiles = collectSourceFiles("src");
    const scriptFiles = collectSourceFiles("scripts");
    files = [...srcFiles, ...scriptFiles];
    console.log(`  Full scan: ${files.length} file(s)`);
  }

  const findings: Finding[] = [];

  // Scan files sequentially (secret scanning is I/O-bound, not CPU-bound)
  for (let i = 0; i < files.length; i++) {
    await scanFile(files[i], i, files.length, findings);
  }

  const elapsedMs = Math.round(performance.now() - startTime);
  printReport(findings, elapsedMs, isIncremental);

  if (strict && findings.filter((f) => f.confidence !== "low").length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
