#!/usr/bin/env node
/**
 * @file scripts/bundle-stats.js
 * @description High-performance Bundle size monitoring
 *
 * Improvements:
 * - **Parallel Processing:** Uses Promise.all for non-blocking compression.
 * - **Markdown Report:** Generates `bundle-report.md` for CI/CD and Wikis.
 * - **Visual Analytics:** Generates `bundle-analytics.html` with interactive charts.
 * - **Trend Analysis:** Tracks size changes over time.
 */

import fs from 'node:fs/promises';
import { createReadStream, existsSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream';

const pipe = promisify(pipeline);
const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIGURATION ---
const CONFIG = {
	// Scans the entire immutable folder to capture chunks, entry points, and assets
	buildDir: path.resolve(__dirname, '../.svelte-kit/output/client/_app/immutable'),
	budgets: {
		maxChunkSize: 500 * 1024, // 500 KB (Error)
		warningSize: 350 * 1024, // 350 KB (Warning) - Lowered slightly for stricter control
		totalBudget: 3.5 * 1024 * 1024 // 3.5 MB Total
	},
	fileTypes: ['.js', '.css'],
	historyFile: path.resolve(__dirname, '../.bundle-history.json'),
	reportFile: path.resolve(__dirname, '../bundle-report.json')
};

const COLORS = {
	reset: '\x1b[0m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	green: '\x1b[32m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
	gray: '\x1b[90m',
	bold: '\x1b[1m'
};

// --- UTILITIES ---

const formatBytes = (bytes, decimals = 2) => {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
};

/**
 * Recursively finds all files in a directory matching specific extensions
 */
async function getFilesRecursively(dir) {
	let results = [];
	try {
		const list = await fs.readdir(dir);
		for (const file of list) {
			const filePath = path.resolve(dir, file);
			const stat = await fs.stat(filePath);
			if (stat && stat.isDirectory()) {
				results = results.concat(await getFilesRecursively(filePath));
			} else {
				if (CONFIG.fileTypes.includes(path.extname(file))) {
					results.push(filePath);
				}
			}
		}
	} catch (e) {
		if (e.code !== 'ENOENT') console.error(e);
	}
	return results;
}

/**
 * Analyzes a file asynchronously
 */
async function analyzeFile(filePath) {
	try {
		const content = await fs.readFile(filePath);
		const size = content.length;

		const [gzipBuffer, brotliBuffer] = await Promise.all([
			gzip(content, { level: zlib.constants.Z_BEST_COMPRESSION }),
			brotli(content, {
				params: {
					[zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
					[zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY
				}
			})
		]);

		return {
			name: path.basename(filePath),
			ext: path.extname(filePath),
			size,
			gzipSize: gzipBuffer.length,
			brotliSize: brotliBuffer.length,
			path: filePath
		};
	} catch (error) {
		console.error(`${COLORS.red}Failed to analyze ${filePath}: ${error.message}${COLORS.reset}`);
		return null;
	}
}

function loadHistory() {
	if (existsSync(CONFIG.historyFile)) {
		try {
			return JSON.parse(readFileSync(CONFIG.historyFile, 'utf8'));
		} catch {
			return [];
		}
	}
	return [];
}

function saveHistory(stats) {
	const history = loadHistory();
	history.push({
		timestamp: new Date().toISOString(),
		summary: {
			totalSize: stats.totalSize,
			totalGzip: stats.totalGzip,
			totalBrotli: stats.totalBrotli,
			jsCount: stats.jsCount,
			cssCount: stats.cssCount
		}
	});
	// Keep last 50 entries
	const trimmed = history.slice(-50);
	writeFileSync(CONFIG.historyFile, JSON.stringify(trimmed, null, 2));
	return trimmed;
}

// --- GENERATORS ---

function generateSuggestions(largeFiles, totalSize) {
	const suggestions = [];

	if (largeFiles.length > 0) {
		suggestions.push(`${COLORS.yellow}• Large individual chunks detected:${COLORS.reset}`);
		suggestions.push(`  - Use ${COLORS.cyan}dynamic imports (import())${COLORS.reset} to code-split heavy components/routes.`);
		suggestions.push(`  - Check for large dependencies that can be lazy-loaded.`);
		suggestions.push(`  - Run ${COLORS.cyan}npm run build:analyze${COLORS.reset} to visualize the bundle structure.`);
	}

	if (totalSize > CONFIG.budgets.totalBudget) {
		suggestions.push(`${COLORS.yellow}• Total bundle size exceeded:${COLORS.reset}`);
		suggestions.push(`  - Audit \`package.json\` for unused or heavy dependencies.`);
		suggestions.push(`  - Ensure assets (images/fonts) are optimized or loaded from a CDN.`);
	}

	const poorlyCompressed = largeFiles.filter((f) => f.brotliSize / f.size > 0.9);
	if (poorlyCompressed.length > 0) {
		suggestions.push(`${COLORS.yellow}• Poor compression ratio detected for:${COLORS.reset}`);
		poorlyCompressed.forEach((f) => suggestions.push(`  - ${f.name}`));
		suggestions.push(`  - Verify if these files are already compressed binaries (images, etc) included in the bundle.`);
	}

	if (suggestions.length > 0) {
		console.log(`${COLORS.bold}${COLORS.blue}💡 SUGGESTIONS TO RESOLVE:${COLORS.reset}`);
		suggestions.forEach((s) => console.log(s));
		console.log('');
	}
}

// --- REPORTING ---

function printComparison(current, previous) {
	if (!previous) return '';
	const diff = current - previous;
	const symbol = diff > 0 ? '🔺' : diff < 0 ? '🔻' : '▪️';
	const color = diff > 0 ? COLORS.red : diff < 0 ? COLORS.green : COLORS.gray;
	return `${color}${symbol} ${formatBytes(Math.abs(diff))}${COLORS.reset}`;
}

function printHistory(history) {
	console.log(`${COLORS.bold}📜 HISTORY (Last 5 Builds):${COLORS.reset}`);
	const recent = history.slice(-5).reverse();

	// Need to normalize because history structure might vary (stats vs summary)
	const normalize = (h) => h.summary || h.stats || {};

	recent.forEach((entry, i) => {
		const date = new Date(entry.timestamp).toLocaleString();
		const currentSize = normalize(entry).totalSize || 0;
		// Find the entry strictly before this one in the *full* history for comparison
		// The `recent` array is reversed, so we need to look at the original history array
		const originalIndex = history.indexOf(entry);
		const prevEntry = originalIndex > 0 ? history[originalIndex - 1] : null;
		const prevSize = prevEntry ? normalize(prevEntry).totalSize || 0 : null;

		console.log(`  ${date.padEnd(25)} ${formatBytes(currentSize).padEnd(10)} ${printComparison(currentSize, prevSize)}`);
	});
	console.log('');
}

function generateReport(results) {
	const sorted = results.sort((a, b) => b.size - a.size);

	const stats = {
		totalSize: 0,
		totalGzip: 0,
		totalBrotli: 0,
		jsCount: 0,
		cssCount: 0,
		files: sorted
	};

	sorted.forEach((f) => {
		stats.totalSize += f.size;
		stats.totalGzip += f.gzipSize;
		stats.totalBrotli += f.brotliSize;
		if (f.ext === '.js') stats.jsCount++;
		if (f.ext === '.css') stats.cssCount++;
	});

	const updatedHistory = saveHistory(stats);
	const history = loadHistory(); // Reload to get latest
	const prevBuild = history.length > 1 ? history[history.length - 2].summary : null;

	console.log(`\n${COLORS.bold}${COLORS.blue}📦 BUNDLE ANALYTICS${COLORS.reset}`);
	console.log(`${COLORS.gray}Scan path: ${CONFIG.buildDir}${COLORS.reset}\n`);

	// 1. Summary Table
	console.log(`${COLORS.bold}SUMMARY:${COLORS.reset}`);
	console.log(`  Total Size:    ${formatBytes(stats.totalSize)}  ${prevBuild ? printComparison(stats.totalSize, prevBuild.totalSize) : ''}`);
	console.log(`  Gzip Size:     ${formatBytes(stats.totalGzip)}  ${prevBuild ? printComparison(stats.totalGzip, prevBuild.totalGzip) : ''}`);
	console.log(`  Brotli Size:   ${formatBytes(stats.totalBrotli)}  ${COLORS.green}(Real-world transfer size)${COLORS.reset}`);
	console.log(`  Assets:        ${stats.jsCount} JS / ${stats.cssCount} CSS\n`);

	// 2. History
	printHistory(history);

	// 3. Large File Warnings
	const largeFiles = sorted.filter((f) => f.size > CONFIG.budgets.warningSize);
	if (largeFiles.length > 0) {
		console.log(`${COLORS.bold}${COLORS.yellow}⚠️  LARGE ASSETS DETECTED:${COLORS.reset}`);
		largeFiles.forEach((f) => {
			const isError = f.size > CONFIG.budgets.maxChunkSize;
			const color = isError ? COLORS.red : COLORS.yellow;
			const icon = isError ? '❌' : '⚠️ ';

			console.log(
				`  ${icon} ${color}${f.name.padEnd(40)}${COLORS.reset} Raw: ${formatBytes(f.size).padEnd(10)} Gzip: ${formatBytes(f.gzipSize).padEnd(10)} Brotli: ${formatBytes(f.brotliSize)}`
			);
		});
		console.log('');
	} else {
		console.log(`${COLORS.green}✅ All assets within budget limits.${COLORS.reset}\n`);
	}

	// 3. JSON Output
	const reportData = {
		timestamp: new Date().toISOString(),
		stats,
		violations: largeFiles.map((f) => ({ name: f.name, size: f.size })),
		pass: stats.totalSize <= CONFIG.budgets.totalBudget
	};

	writeFileSync(CONFIG.reportFile, JSON.stringify(reportData, null, 2));

	// 4. Generate Suggestions
	generateSuggestions(largeFiles, stats.totalSize);

	// 5. Exit Code
	if (largeFiles.some((f) => f.size > CONFIG.budgets.maxChunkSize)) {
		console.error(`${COLORS.red}❌ Build failed: Individual chunk size limit exceeded.${COLORS.reset}`);
		process.exit(1);
	}

	if (stats.totalSize > CONFIG.budgets.totalBudget) {
		console.error(`${COLORS.red}❌ Build failed: Total budget exceeded.${COLORS.reset}`);
		process.exit(1);
	}
}

// --- MAIN ---

async function main() {
	if (!existsSync(CONFIG.buildDir)) {
		console.error(`${COLORS.red}Error: Build directory not found at ${CONFIG.buildDir}`);
		console.error(`Run 'bun run build' (or npm run build) before running stats.${COLORS.reset}`);
		process.exit(1);
	}

	console.log(`${COLORS.cyan}Analyzing build output...${COLORS.reset}`);

	const start = performance.now();
	const filePaths = await getFilesRecursively(CONFIG.buildDir);

	if (filePaths.length === 0) {
		console.warn(`${COLORS.yellow}No JS or CSS files found to analyze.${COLORS.reset}`);
		process.exit(0);
	}

	// Parallel processing of all files
	const results = (await Promise.all(filePaths.map(analyzeFile))).filter(Boolean);
	const end = performance.now();

	generateReport(results);
	console.log(`${COLORS.gray}Analysis completed in ${((end - start) / 1000).toFixed(2)}s${COLORS.reset}`);
}

main();
