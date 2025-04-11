/**
 * @file eslint.config.js
 * @description ESLint Configuration
 *
 * ### Features
 * - ESLint configuration file for Svelte and TypeScript
 */

import prettier from 'eslint-config-prettier';
import js from '@eslint/js';
import { includeIgnoreFile } from '@eslint/compat';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default ts.config(
	// Base recommended configurations
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,

	// General configuration for all files
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
				NodeJS: true,
				svelte: true,
				globalThis: 'readonly'
			},
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
				project: './tsconfig.json', // Enable type-aware linting with TypeScript
				tsconfigRootDir: import.meta.dirname
			}
		},
		rules: {
			'no-undef': 'off', // Disable base no-undef since TypeScript handles it
			'@typescript-eslint/no-unsafe-assignment': 'error', // Catch unsafe TypeScript assignments
			'@typescript-eslint/no-unsafe-call': 'error', // Catch unsafe TypeScript calls
			'svelte/no-reactive-functions': 'warn', // Warn on inefficient reactive function usage in Svelte
			'import/no-unresolved': [
			'error',
			  { ignore: ['@components/*', '@utils/*'] } // Enforce alias usage while ignoring specific patterns
			]
		}
	},

	// Svelte-specific configuration
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		ignores: ['eslint.config.js', 'svelte.config.js'],
		languageOptions: {
			parserOptions: {
				projectService: true, // Enable type-aware linting with TypeScript
				project: './tsconfig.json', // Link to tsconfig for type info within <script>
				extraFileExtensions: ['.svelte'] // Enable type-aware linting with TypeScript
				parser: ts.parser, // Use TypeScript parser for Svelte files
				svelteConfig // Pass Svelte config (e.g., to enable runes mode)
			}
		}
	}
);

