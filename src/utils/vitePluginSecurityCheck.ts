/**
 * @file src/utils/vitePluginSecurityCheck.ts
 * @description Vite plugin to detect and prevent private settings from being imported in client-side code
 *
 * This plugin provides build-time security checks that Vite/SvelteKit don't provide for dynamic environment variables.
 * It scans .svelte files and client-side .ts files for dangerous imports that would expose private settings.
 */

import path from 'node:path';
import type { Plugin } from 'vite';

interface SecurityCheckOptions {
	/** File extensions to check (default: ['.svelte', '.ts']) */
	extensions?: string[];
	/** Whether to fail the build on violations (default: true) */
	failOnError?: boolean;
	/** Whether to show warnings for suspicious patterns (default: true) */
	showWarnings?: boolean;
}

/**
 * Creates a Vite plugin that checks for security violations in client-side code.
 *
 * Detects:
 * - Direct imports of privateEnv
 * - Calls to getPrivateSetting() in .svelte files
 * - Calls to getAllSettings() in .svelte files (exposes private data)
 */
export function securityCheckPlugin(options: SecurityCheckOptions = {}): Plugin {
	const { failOnError = true, showWarnings = true, extensions = ['.svelte', '.ts', '.js'] } = options;

	const violations: Array<{ file: string; line: number; issue: string }> = [];
	const warnings: Array<{ file: string; line: number; issue: string }> = [];

	// Patterns to detect security violations
	const DANGEROUS_PATTERNS = [
		{
			pattern: /import\s+{[^}]*privateEnv[^}]*}\s+from\s+['"]@src\/stores\/globalSettings['"]/g,
			severity: 'error' as const,
			message: 'SECURITY: Importing privateEnv in client-side code exposes database passwords, JWT secrets, and other sensitive data!'
		},
		{
			pattern: /getPrivateSetting\s*\(/g,
			severity: 'error' as const,
			message: 'SECURITY: Using getPrivateSetting() in client-side code will attempt to access private settings!'
		},
		{
			pattern: /getAllSettings\s*\(/g,
			severity: 'error' as const,
			message: 'SECURITY: getAllSettings() exposes ALL private settings including passwords and secrets!'
		}
	];

	const SUSPICIOUS_PATTERNS = [
		{
			pattern: /getUntypedSetting\s*\([^)]*,\s*['"]private['"]\s*\)/g,
			message: 'WARNING: getUntypedSetting() with "private" scope may expose sensitive data'
		}
	];

	function checkFile(id: string, code: string) {
		const ext = path.extname(id);
		if (!extensions.includes(ext)) {
			return;
		}

		// Skip server-side files - these are ONLY run on the server, never bundled for client
		if (
			id.includes('+page.server.') ||
			id.includes('+layout.server.') ||
			id.includes('+server.') ||
			id.includes('/hooks.server.') ||
			id.includes('/hooks/') || // All files in src/hooks/ are server-only
			id.includes('/routes/api/') || // All API routes are server-only
			id.includes('/auth/') || // Auth modules are server-only
			id.includes('/databases/') || // Database code is server-only
			id.includes('/src/stores/globalSettings.ts') || // The store itself needs these functions
			(id.includes('/src/widgets/') && id.includes('.ts') && !id.includes('.svelte')) // Widget .ts files are typically server-only utilities
		) {
			return;
		}

		// Additional check: if file is a .ts file (not .svelte), check if it's imported by client code
		// For now, we'll primarily focus on .svelte files which are definitely client-side
		if (ext === '.svelte') {
			// This is definitely client-side code - check thoroughly
		} else if (ext === '.ts' || ext === '.js') {
			// .ts/.js files might be server-only or shared
			// Only check if they're in client-facing directories
			const clientDirs = ['/src/components/', '/src/routes/(app)', '/src/routes/(unauthenticated)'];
			const isClientDir = clientDirs.some((dir) => id.includes(dir));
			if (!isClientDir) {
				return; // Skip server-only .ts files
			}
		}

		const lines = code.split('\n');

		// Check for dangerous patterns
		for (const { pattern, severity, message } of DANGEROUS_PATTERNS) {
			let match: RegExpExecArray | null;
			const regex = new RegExp(pattern.source, pattern.flags);

			while ((match = regex.exec(code)) !== null) {
				const lineNumber = code.substring(0, match.index).split('\n').length;
				const lineContent = lines[lineNumber - 1]?.trim();

				if (severity === 'error') {
					violations.push({
						file: path.relative(process.cwd(), id),
						line: lineNumber,
						issue: `${message}\n  → ${lineContent}`
					});
				}
			}
		}

		// Check for suspicious patterns
		if (showWarnings) {
			for (const { pattern, message } of SUSPICIOUS_PATTERNS) {
				let match: RegExpExecArray | null;
				const regex = new RegExp(pattern.source, pattern.flags);

				while ((match = regex.exec(code)) !== null) {
					const lineNumber = code.substring(0, match.index).split('\n').length;
					const lineContent = lines[lineNumber - 1]?.trim();

					warnings.push({
						file: path.relative(process.cwd(), id),
						line: lineNumber,
						issue: `${message}\n  → ${lineContent}`
					});
				}
			}
		}
	}

	return {
		name: 'vite-plugin-security-check',

		enforce: 'pre',

		// Check files during transform
		transform(code, id) {
			checkFile(id, code);
			return null;
		},

		// Report violations at build end
		buildEnd() {
			const useColor = process.stdout.isTTY;
			const red = useColor ? '\x1b[31m' : '';
			const yellow = useColor ? '\x1b[33m' : '';
			const reset = useColor ? '\x1b[0m' : '';
			const bold = useColor ? '\x1b[1m' : '';

			// Report warnings
			if (warnings.length > 0) {
				console.warn(`\n${yellow}${bold}⚠️  Security Warnings:${reset}\n`);
				for (const warning of warnings) {
					console.warn(`${yellow}  ${warning.file}:${warning.line}${reset}`);
					console.warn(`    ${warning.issue}\n`);
				}
			}

			// Report violations
			if (violations.length > 0) {
				console.error(`\n${red}${bold}🚨 SECURITY VIOLATIONS DETECTED!${reset}\n`);
				console.error(`${red}Found ${violations.length} critical security issue(s):${reset}\n`);

				for (const violation of violations) {
					console.error(`${red}${bold}  ✗ ${violation.file}:${violation.line}${reset}`);
					console.error(`    ${violation.issue}\n`);
				}

				console.error(`${red}${bold}These violations expose sensitive data to the client!${reset}`);
				console.error(`${red}Fix these issues before deploying to production.${reset}\n`);

				console.error(`${bold}How to fix:${reset}`);
				console.error('  1. Remove privateEnv imports from .svelte files');
				console.error('  2. Use page.data from +page.server.ts load functions instead');
				console.error('  3. Only access private settings in +page.server.ts, +layout.server.ts, or +server.ts files\n');

				if (failOnError) {
					throw new Error(`Build failed due to ${violations.length} security violation(s)`);
				}
			} else if (violations.length === 0 && warnings.length === 0) {
				console.log(`${useColor ? '\x1b[32m' : ''}✓ Security check passed: No private settings exposed to client${reset}`);
			}
		}
	};
}
