#!/usr/bin/env bun
/**
 * @file scripts/bundle-stats.ts
 * @description High-performance Bundle size monitoring in TypeScript.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import zlib from "node:zlib";
import { globSync } from "glob";

const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);

// --- TYPES ---
interface BundleStats {
  name: string;
  ext: string;
  size: number;
  gzipSize: number;
  brotliSize: number;
  path: string;
}

interface BuildMetadata {
  buildTime: number;
  clientModules: number;
  serverModules: number;
}

interface Summary {
  totalSize: number;
  totalGzip: number;
  totalBrotli: number;
  jsCount: number;
  cssCount: number;
  buildTime: number;
  clientModules: number;
  serverModules: number;
}

interface HistoryEntry {
  timestamp: string;
  summary: Summary;
}

// --- CONFIGURATION ---
const rootDir = process.cwd();

const findImmutableDir = (root: string) => {
  const commonPaths = [
    ".svelte-kit/output/client/_app/immutable",
    ".svelte-kit/output/client/immutable",
    "build/client/_app/immutable",
    "build/immutable",
  ];
  for (const p of commonPaths) {
    const fullPath = path.resolve(root, p);
    if (existsSync(fullPath)) return fullPath;
  }
  return path.resolve(root, ".svelte-kit/output/client/_app/immutable");
};

const CONFIG = {
  buildDir: findImmutableDir(rootDir),
  metadataDir: path.resolve(rootDir, ".svelte-kit/output"),
  budgets: {
    maxChunkSize: 500 * 1024,
    warningSize: 350 * 1024,
    totalBudget: 3.5 * 1024 * 1024,
  },
  fileTypes: [".js", ".css"],
  historyFile: path.resolve(rootDir, "scripts/.bundle-history.json"),
  reportFile: path.resolve(rootDir, "bundle-report.json"),
};

const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  bold: "\x1b[1m",
};

// --- UTILITIES ---
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
};

async function getBuildMetadata(): Promise<BuildMetadata> {
  try {
    const clientPath = path.resolve(CONFIG.metadataDir, "build-metadata-client.json");
    const serverPath = path.resolve(CONFIG.metadataDir, "build-metadata-server.json");

    let clientData = { duration: 0, moduleCount: 0 };
    let serverData = { duration: 0, moduleCount: 0 };

    if (existsSync(clientPath)) {
      clientData = JSON.parse(readFileSync(clientPath, "utf8"));
    }
    if (existsSync(serverPath)) {
      serverData = JSON.parse(readFileSync(serverPath, "utf8"));
    }

    return {
      buildTime: clientData.duration + serverData.duration,
      clientModules: clientData.moduleCount,
      serverModules: serverData.moduleCount,
    };
  } catch {
    return { buildTime: 0, clientModules: 0, serverModules: 0 };
  }
}

async function getFilesRecursively(dir: string): Promise<string[]> {
  try {
    return globSync("**/*.{js,css}", { cwd: dir, absolute: true });
  } catch (e: any) {
    console.error(e);
    return [];
  }
}

async function analyzeFile(filePath: string): Promise<BundleStats | null> {
  try {
    const content = await fs.readFile(filePath);
    const size = content.length;

    const [gzipBuffer, brotliBuffer] = await Promise.all([
      gzip(content, { level: zlib.constants.Z_BEST_COMPRESSION }),
      brotli(content, {
        params: {
          [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
          [zlib.constants.BROTLI_PARAM_QUALITY]: 6, // Quality 6 is ~15x faster than 11 for estimation
        },
      }),
    ]);

    return {
      name: path.basename(filePath),
      ext: path.extname(filePath),
      size,
      gzipSize: gzipBuffer.length,
      brotliSize: brotliBuffer.length,
      path: filePath,
    };
  } catch (error: any) {
    console.error(`${COLORS.red}Failed to analyze ${filePath}: ${error.message}${COLORS.reset}`);
    return null;
  }
}

function loadHistory(): HistoryEntry[] {
  if (existsSync(CONFIG.historyFile)) {
    try {
      return JSON.parse(readFileSync(CONFIG.historyFile, "utf8"));
    } catch {
      return [];
    }
  }
  return [];
}

function saveHistory(summary: Summary): HistoryEntry[] {
  const history = loadHistory();
  history.push({
    timestamp: new Date().toISOString(),
    summary,
  });
  const trimmed = history.slice(-50);
  writeFileSync(CONFIG.historyFile, JSON.stringify(trimmed, null, 2));
  return trimmed;
}

async function main() {
  if (!existsSync(CONFIG.buildDir)) {
    console.error(
      `${COLORS.red}Error: Build directory not found at ${CONFIG.buildDir}${COLORS.reset}`,
    );
    process.exit(1);
  }

  console.log(`${COLORS.cyan}Analyzing build output...${COLORS.reset}`);

  const start = performance.now();
  const filePaths = await getFilesRecursively(CONFIG.buildDir);
  const results = (await Promise.all(filePaths.map(analyzeFile))).filter(
    (f): f is BundleStats => f !== null,
  );
  const metadata = await getBuildMetadata();

  const totalSize = results.reduce((acc, f) => acc + f.size, 0);
  const totalGzip = results.reduce((acc, f) => acc + f.gzipSize, 0);
  const totalBrotli = results.reduce((acc, f) => acc + f.brotliSize, 0);
  const jsCount = results.filter((f) => f.ext === ".js").length;
  const cssCount = results.filter((f) => f.ext === ".css").length;

  const summary: Summary = {
    totalSize,
    totalGzip,
    totalBrotli,
    jsCount,
    cssCount,
    buildTime: metadata.buildTime,
    clientModules: metadata.clientModules,
    serverModules: metadata.serverModules,
  };

  saveHistory(summary);

  console.log(`\n${COLORS.bold}${COLORS.blue}📦 BUNDLE ANALYTICS${COLORS.reset}`);
  console.log(`  Total Size:    ${formatBytes(totalSize)}`);
  console.log(
    `  Brotli Size:   ${formatBytes(totalBrotli)}  ${COLORS.green}(Transfer size)${COLORS.reset}`,
  );
  console.log(`  Assets:        ${jsCount} JS / ${cssCount} CSS\n`);

  const largeFiles = results.filter((f) => f.size > CONFIG.budgets.warningSize);
  if (largeFiles.length > 0) {
    console.log(`${COLORS.bold}${COLORS.yellow}⚠️  LARGE ASSETS:${COLORS.reset}`);
    largeFiles.forEach((f) => {
      const color = f.size > CONFIG.budgets.maxChunkSize ? COLORS.red : COLORS.yellow;
      console.log(`  ${color}${f.name.padEnd(40)}${COLORS.reset} ${formatBytes(f.size)}`);
    });
  } else {
    console.log(`${COLORS.green}✅ All assets within budget.${COLORS.reset}`);
  }

  writeFileSync(
    CONFIG.reportFile,
    JSON.stringify({ timestamp: new Date().toISOString(), stats: summary, results }, null, 2),
  );

  const end = performance.now();
  console.log(
    `\n${COLORS.gray}Analysis completed in ${((end - start) / 1000).toFixed(2)}s${COLORS.reset}`,
  );
}

main().catch(console.error);
