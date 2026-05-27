/**
 * @file tests/lint-docs.ts
 * @description Validates the frontmatter of all .mdx files in the src/widgets and docs directories.
 *
 * Features:
 * - Validates the frontmatter of all .mdx files in the src/widgets and docs directories.
 * - Checks for missing required fields.
 * - Checks for invalid field types.
 * - Checks for invalid field values.
 * - Checks for invalid field formats.
 * - Checks for invalid field lengths.
 * - Checks for invalid field values.
 * - Checks for invalid field formats.
 * - Checks for invalid field lengths.
 *
 * @note This is a specialized validator for MDX metadata. For code linting/formatting,
 * use `bun run lint` (Biome + ESLint) and `bun run format` (Biome).
 */

import fs from 'node:fs';
import path from 'node:path';
import { array, isoDate, minLength, number, object, optional, pipe, safeParse, string, union } from 'valibot';

// --- Frontmatter Schema Definition ---
// ISO date validator (YYYY-MM-DD)
const isoDateString = pipe(string(), isoDate());

const frontmatterSchema = object({
	path: pipe(string(), minLength(1)),
	title: pipe(string(), minLength(3)),
	description: pipe(string(), minLength(10)),
	order: optional(union([number(), string()])), // can be numeric or string
	icon: optional(string()), // e.g. mdi:form-textbox
	author: pipe(string(), minLength(2)),
	created: isoDateString,
	updated: isoDateString,
	tags: pipe(array(pipe(string(), minLength(2))), minLength(1))
});

// --- simple frontmatter parser without extra deps ---
function parseFrontmatter(content: string): Record<string, unknown> {
	if (!content.startsWith('---')) {
		return {};
	}
	const end = content.indexOf('---', 3);
	if (end === -1) {
		return {};
	}

	const yaml = content.slice(3, end).trim();
	const lines = yaml.split(/\r?\n/);

	const data: Record<string, unknown> = {};
	let currentKey: string | null = null;

	for (const line of lines) {
		if (!line.trim()) {
			continue;
		}

		// detect array continuation (- item)
		if (currentKey && line.trim().startsWith('-')) {
			const val = line
				.replace(/^-/, '')
				.trim()
				.replace(/^['"]|['"]$/g, '');
			if (!Array.isArray(data[currentKey])) {
				data[currentKey] = [];
			}
			(data[currentKey] as unknown[]).push(val);
			continue;
		}

		// normal key: value
		const [key, ...rest] = line.split(':');
		const rawValue = rest.join(':').trim();
		currentKey = key.trim();

		if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
			data[currentKey] = rawValue
				.slice(1, -1)
				.split(',')
				.map((v) => v.trim().replace(/^['"]|['"]$/g, ''));
		} else if (rawValue === '') {
			// block array start → wait for "- item" lines
			data[currentKey] = [];
		} else if (rawValue.startsWith("'") || rawValue.startsWith('"')) {
			data[currentKey] = rawValue.replace(/^['"]|['"]$/g, '');
		} else if (rawValue.match(/^\d+$/)) {
			data[currentKey] = Number(rawValue);
		} else {
			data[currentKey] = rawValue;
		}
	}

	return data;
}

// --- walk docs recursively ---
function* walk(dir: string): Generator<string> {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			yield* walk(full);
		} else if (full.endsWith('.mdx') || full.endsWith('.md')) {
			yield full;
		}
	}
}

// --- run validation ---
const SCAN_DIRS = [path.resolve('./src/widgets'), path.resolve('./docs')];
const PROJECT_ROOT = path.resolve('.');
let totalFiles = 0;
let validFiles = 0;
let invalidFiles = 0;
const mdFiles: string[] = [];
const errors: Array<{ file: string; issues: unknown[] }> = [];

// Print header
console.log('━'.repeat(80));
console.log('🔍 SveltyCMS Documentation Frontmatter Validation');
const now = new Date();
const timestamp = now.toLocaleString('en-US', {
	year: 'numeric',
	month: 'short',
	day: 'numeric',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hour12: false
});
console.log(`📅 ${timestamp}`);
console.log('━'.repeat(80));
console.log('');

for (const dir of SCAN_DIRS) {
	for (const file of walk(dir)) {
		totalFiles++;

		// Check if it's a .md file that should be .mdx
		if (file.endsWith('.md')) {
			mdFiles.push(file);
			continue;
		}

		const raw = fs.readFileSync(file, 'utf-8');
		const data = parseFrontmatter(raw);

		const result = safeParse(frontmatterSchema, data);
		if (result.success) {
			validFiles++;
		} else {
			invalidFiles++;
			errors.push({ file, issues: result.issues });

			// Use relative path for cleaner output
			const relativePath = path.relative(PROJECT_ROOT, file);
			console.error(`\n❌ ${relativePath}`);
			console.error('─'.repeat(80));

			for (const issue of result.issues) {
				const fieldPath = issue.path?.map((p) => p.key || p).join('.') || 'root';
				const fieldName = fieldPath === 'root' ? 'frontmatter' : `"${fieldPath}"`;

				// Make the error message more user-friendly
				let errorMsg = issue.message;

				// Improve common error messages
				if (errorMsg.includes('Expected') && errorMsg.includes('but received undefined')) {
					const match = errorMsg.match(/Expected "(\w+)"/);
					if (match) {
						errorMsg = `Missing required field: "${match[1]}"`;
					}
				} else if (errorMsg.includes('Invalid type')) {
					errorMsg = `${errorMsg} in ${fieldName}`;
				}

				console.error(`   • ${errorMsg}`);

				// Add helpful hints for common issues
				if (errorMsg.includes('Missing required field: "tags"')) {
					console.error('     💡 Add a tags array, e.g.:');
					console.error('        tags:');
					console.error(`          - 'widget'`);
					console.error(`          - 'field'`);
				} else if (errorMsg.includes('Missing required field: "path"')) {
					console.error(`     💡 Add: path: '${relativePath}'`);
				}
			}

			console.error(''); // blank line after each error block
		}
	}
}

// Show .md files that need conversion
if (mdFiles.length > 0) {
	console.log('\n⚠️  Files that need to be converted to .mdx:');
	console.log('─'.repeat(80));
	for (const file of mdFiles) {
		const relativePath = path.relative(PROJECT_ROOT, file);
		console.log(`   📄 ${relativePath}`);
	}
	console.log('');
}

// --- summary ---
console.log('━'.repeat(80));
console.log('📊 SveltyCMS Documentation Summary');
console.log('━'.repeat(80));
const mdxFiles = totalFiles - mdFiles.length;
console.log(`Total files:     ${totalFiles} (${mdxFiles} .mdx, ${mdFiles.length} .md)`);
console.log(`Validation:      ✅ ${validFiles} valid  |  ❌ ${invalidFiles} invalid`);
console.log('━'.repeat(80));

if (invalidFiles > 0 || mdFiles.length > 0) {
	if (invalidFiles > 0) {
		console.error(`\n⚠️  ${invalidFiles} file(s) with invalid frontmatter:`);
		errors.forEach((e) => {
			const relativePath = path.relative(PROJECT_ROOT, e.file);
			console.error(`   ❌ ${relativePath}`);
		});
		console.error('\nPlease fix the errors above.');
	}
	if (mdFiles.length > 0) {
		console.error(`⚠️  ${mdFiles.length} .md file(s) need to be converted to .mdx format.`);
	}
	console.log('');
	process.exit(1);
} else {
	console.log('\n✨ All files have valid frontmatter!\n');
}
