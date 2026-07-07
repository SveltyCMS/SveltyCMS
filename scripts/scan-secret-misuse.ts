/**
 * @file scripts/scan-secret-misuse.ts
 * @description Static analysis scanner that detects secret misuse patterns
 * in source code — forbidden key access, hardcoded credentials, and
 * accidental secret exposure in non-server files.
 *
 * Usage:
 *   bun run scripts/scan-secret-misuse.ts
 *   bun run scripts/scan-secret-misuse.ts --strict
 */

import fs from "node:fs/promises";
import path from "node:path";
import { globSync } from "glob";

const ROOT = process.cwd();

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

interface Finding {
  file: string;
  line: number;
  message: string;
}
const findings: Finding[] = [];
function addFinding(file: string, line: number, message: string) {
  findings.push({ file, line, message });
}

function collectSourceFiles(dir: string): string[] {
  return globSync(`${dir}/**/*.{ts,svelte,js}`, {
    nodir: true,
    ignore: "**/node_modules/**",
  });
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

async function scanFile(filePath: string, fileIndex: number, total: number): Promise<void> {
  const content = await fs.readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const isServer = isServerFile(filePath);
  const relPath = path.relative(ROOT, filePath).replace(/\\/g, "/");

  if (!isServer) {
    for (const key of ALL_FORBIDDEN_KEYS) {
      const regex = new RegExp(`getPrivateSetting(Sync)?\\s*\\(\\s*["'\`]${key}["'\`]`, "gi");
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          addFinding(relPath, i + 1, `${key}: private key accessed in non-server file`);
        }
      }
    }
  }

  for (const { pattern, name } of EXPOSURE_PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        addFinding(relPath, i + 1, `Potential ${name}`);
      }
    }
  }

  if ((fileIndex + 1) % 100 === 0 || fileIndex === total - 1) {
    process.stderr.write(`\r  Scanning... ${fileIndex + 1}/${total}`);
  }
}

async function main() {
  const strict = process.argv.includes("--strict");
  console.log("🔍 Secret Misuse Scanner\n");

  const srcFiles = collectSourceFiles("src");
  const scriptFiles = collectSourceFiles("scripts");
  const allFiles = [...srcFiles, ...scriptFiles];
  console.log(`  Files to scan: ${allFiles.length}`);

  for (let i = 0; i < allFiles.length; i++) {
    await scanFile(allFiles[i], i, allFiles.length);
  }

  process.stderr.write("\n");

  if (findings.length === 0) {
    console.log("  ✅ No secret misuse detected.\n");
    process.exit(0);
  }

  console.log(`  ❌ ${findings.length} finding(s):\n`);
  const byFile = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = byFile.get(f.file) || [];
    list.push(f);
    byFile.set(f.file, list);
  }
  for (const [file, list] of byFile) {
    console.log(`  ${file}:`);
    for (const f of list) console.log(`    L${f.line}: ${f.message}`);
  }
  console.log(`\n  ${findings.length} total finding(s).`);

  if (strict) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
