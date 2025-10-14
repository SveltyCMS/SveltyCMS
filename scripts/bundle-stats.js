#!/usr/bin/env node
/**
 * @file scripts/bundle-stats.js
 * @description Bundle size monitoring and reporting script
 *
 * Analyzes the build output and generates a comprehensive report of:
 * - Chunk sizes (raw and gzipped)
 * - Size trends over time
 * - Budget violations
 * - Recommendations for optimization
 *
 * @usage
 * bun run build:stats
 *
 * @requirements
 * - Run after `bun run build`
 * - Requires .svelte-kit/output/client directory
 */

import fs from 'fs';
import path from 'path';
import { gzipSync, brotliCompressSync } from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
	outputDir: path.join(__dirname, '../.svelte-kit/output/client/_app/immutable/chunks'),
	budgets: {
		maxChunkSize: 500 * 1024, // 500 KB
		warningSize: 400 * 1024, // 400 KB
		totalBudget: 3 * 1024 * 1024 // 3 MB total
	},
	historyFile: path.join(__dirname, '../.bundle-history.json')
};

// ANSI color codes
const colors = {
	reset: '\x1b[0m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	green: '\x1b[32m',
	blue: '\x1b[34m',
	gray: '\x1b[90m',
	bold: '\x1b[1m'
};

// Get all JS chunk files
function getChunkFiles() {
	try {
		const files = fs.readdirSync(CONFIG.outputDir);
		return files.filter((f) => f.endsWith('.js')).map((f) => path.join(CONFIG.outputDir, f));
	} catch {
		console.error(`${colors.red}Error: Build output not found. Run 'bun run build' first.${colors.reset}`);
		process.exit(1);
	}
}

// Analyze a single chunk file
function analyzeChunk(filePath) {
	const content = fs.readFileSync(filePath);
	const size = content.length;
	const gzipSize = gzipSync(content).length;
	const brotliSize = brotliCompressSync(content).length;
	const gzipRatio = ((1 - gzipSize / size) * 100).toFixed(1);
	const brotliRatio = ((1 - brotliSize / size) * 100).toFixed(1);

	return {
		name: path.basename(filePath),
		size,
		gzipSize,
		brotliSize,
		gzipRatio,
		brotliRatio,
		path: filePath
	};
}

// Format bytes to human-readable
function formatBytes(bytes, decimals = 2) {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

// Get status color based on size
function getStatusColor(size) {
	if (size > CONFIG.budgets.maxChunkSize) return colors.red;
	if (size > CONFIG.budgets.warningSize) return colors.yellow;
	return colors.green;
}

// Load historical data
function loadHistory() {
	try {
		if (fs.existsSync(CONFIG.historyFile)) {
			return JSON.parse(fs.readFileSync(CONFIG.historyFile, 'utf8'));
		}
	} catch {
		console.warn(`${colors.yellow}Warning: Could not load history${colors.reset}`);
	}
	return [];
}

// Save current stats to history
function saveHistory(stats) {
	try {
		const history = loadHistory();
		history.push({
			timestamp: new Date().toISOString(),
			stats: {
				totalSize: stats.totalSize,
				totalGzipSize: stats.totalGzipSize,
				chunkCount: stats.chunks.length,
				largestChunk: stats.chunks[0].size
			}
		});

		// Keep only last 30 builds
		const recentHistory = history.slice(-30);
		fs.writeFileSync(CONFIG.historyFile, JSON.stringify(recentHistory, null, 2));
	} catch {
		console.warn(`${colors.yellow}Warning: Could not save history${colors.reset}`);
	}
}

// Compare with previous build
function compareWithPrevious(currentStats) {
	const history = loadHistory();
	if (history.length === 0) return null;

	const previous = history[history.length - 1].stats;
	return {
		totalSizeDiff: currentStats.totalSize - previous.totalSize,
		gzipSizeDiff: currentStats.totalGzipSize - previous.totalGzipSize,
		chunkCountDiff: currentStats.chunks.length - previous.chunkCount,
		largestChunkDiff: currentStats.chunks[0].size - previous.largestChunk
	};
}

// Generate recommendations
function generateRecommendations(chunks) {
	const recommendations = [];

	// Check for oversized chunks
	const oversized = chunks.filter((c) => c.size > CONFIG.budgets.maxChunkSize);
	if (oversized.length > 0) {
		recommendations.push({
			level: 'error',
			message: `${oversized.length} chunk(s) exceed 500 KB limit`,
			action: 'Consider code splitting or lazy loading'
		});
	}

	// Check compression ratio
	const poorCompression = chunks.filter((c) => parseFloat(c.brotliRatio) < 60);
	if (poorCompression.length > 0) {
		recommendations.push({
			level: 'warning',
			message: `${poorCompression.length} chunk(s) have poor Brotli compression (<60%)`,
			action: 'Check for large uncompressible assets (images, fonts)'
		});
	}

	// Check total size
	const totalSize = chunks.reduce((sum, c) => sum + c.size, 0);
	if (totalSize > CONFIG.budgets.totalBudget) {
		recommendations.push({
			level: 'error',
			message: 'Total bundle size exceeds 3 MB budget',
			action: 'Review vendor dependencies and implement tree-shaking'
		});
	}

	return recommendations;
}

// Print report
function printReport(stats, comparison, recommendations) {
	console.log(`\n${colors.bold}${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
	console.log(`${colors.bold}${colors.blue}          📊 BUNDLE SIZE ANALYSIS REPORT${colors.reset}`);
	console.log(`${colors.bold}${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);

	// Summary
	console.log(`${colors.bold}Summary:${colors.reset}`);
	console.log(`  Total Chunks: ${stats.chunks.length}`);
	console.log(`  Total Size:   ${formatBytes(stats.totalSize)}`);
	console.log(`  Gzip:         ${formatBytes(stats.totalGzipSize)} (${stats.avgCompression}% compression)`);
	console.log(
		`  Brotli:       ${formatBytes(stats.totalBrotliSize)} (${stats.avgBrotliCompression}% compression) ${colors.green}⚡ Recommended${colors.reset}\n`
	);

	// Comparison
	if (comparison) {
		const sizeIcon = comparison.totalSizeDiff > 0 ? '📈' : '📉';
		const sizeColor = comparison.totalSizeDiff > 0 ? colors.red : colors.green;
		const sizeDiff = formatBytes(Math.abs(comparison.totalSizeDiff));
		const gzipDiff = formatBytes(Math.abs(comparison.gzipSizeDiff));

		console.log(`${colors.bold}Change from previous build:${colors.reset}`);
		console.log(`  ${sizeIcon} Total Size: ${sizeColor}${comparison.totalSizeDiff > 0 ? '+' : '-'}${sizeDiff}${colors.reset}`);
		console.log(`  ${sizeIcon} Gzipped:    ${sizeColor}${comparison.gzipSizeDiff > 0 ? '+' : '-'}${gzipDiff}${colors.reset}\n`);
	}

	// Top chunks
	console.log(`${colors.bold}Top 10 Largest Chunks:${colors.reset}`);
	stats.chunks.slice(0, 10).forEach((chunk, i) => {
		const statusColor = getStatusColor(chunk.size);
		const status = chunk.size > CONFIG.budgets.maxChunkSize ? '❌' : chunk.size > CONFIG.budgets.warningSize ? '⚠️ ' : '✅';
		const brotliSavings = (((chunk.gzipSize - chunk.brotliSize) / chunk.gzipSize) * 100).toFixed(0);

		console.log(`  ${status} ${statusColor}${(i + 1).toString().padStart(2)}. ${chunk.name.padEnd(30)}${colors.reset}`);
		console.log(
			`     ${colors.gray}${formatBytes(chunk.size).padEnd(10)} → gzip: ${formatBytes(chunk.gzipSize)} (${chunk.gzipRatio}%) → brotli: ${formatBytes(chunk.brotliSize)} (${chunk.brotliRatio}%, ${colors.green}-${brotliSavings}%${colors.gray})${colors.reset}`
		);
	});

	// Recommendations
	if (recommendations.length > 0) {
		console.log(`\n${colors.bold}${colors.yellow}⚡ Recommendations:${colors.reset}`);
		recommendations.forEach((rec) => {
			const icon = rec.level === 'error' ? '❌' : '⚠️ ';
			const color = rec.level === 'error' ? colors.red : colors.yellow;
			console.log(`  ${icon} ${color}${rec.message}${colors.reset}`);
			console.log(`     ${colors.gray}→ ${rec.action}${colors.reset}`);
		});
	} else {
		console.log(`\n${colors.green}✅ All chunks within budget! Great job!${colors.reset}`);
	}

	console.log(`\n${colors.bold}${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
}

// Main execution
function main() {
	console.log(`${colors.blue}Analyzing build output...${colors.reset}\n`);

	// Get and analyze all chunks
	const chunkFiles = getChunkFiles();
	const chunks = chunkFiles.map(analyzeChunk).sort((a, b) => b.size - a.size);

	// Calculate statistics
	const totalSize = chunks.reduce((sum, c) => sum + c.size, 0);
	const totalGzipSize = chunks.reduce((sum, c) => sum + c.gzipSize, 0);
	const totalBrotliSize = chunks.reduce((sum, c) => sum + c.brotliSize, 0);
	const avgCompression = (chunks.reduce((sum, c) => sum + parseFloat(c.gzipRatio), 0) / chunks.length).toFixed(1);
	const avgBrotliCompression = (chunks.reduce((sum, c) => sum + parseFloat(c.brotliRatio), 0) / chunks.length).toFixed(1);

	const stats = {
		chunks,
		totalSize,
		totalGzipSize,
		totalBrotliSize,
		avgCompression,
		avgBrotliCompression
	};

	// Compare with previous build
	const comparison = compareWithPrevious(stats);

	// Generate recommendations
	const recommendations = generateRecommendations(chunks);

	// Print report
	printReport(stats, comparison, recommendations);

	// Save to history
	saveHistory(stats);

	// Exit with error code if budget exceeded
	if (recommendations.some((r) => r.level === 'error')) {
		process.exit(1);
	}
}

main();
