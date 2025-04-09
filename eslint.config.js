import prettier from 'eslint-config-prettier';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		// Specific config for TS files, including .svelte.ts
		// Ensures the TS parser handles these files directly with project context
		files: ['**/*.ts', '**/*.svelte.ts'],
		languageOptions: {
			parser: ts.parser,
			parserOptions: {
				project: './tsconfig.json', // Link to tsconfig for type information
				tsconfigRootDir: import.meta.dirname, // Root dir for tsconfig resolution
				extraFileExtensions: ['.svelte.ts'] // Explicitly include the extension
			}
		},
		rules: {
			// You might add TS-specific rule adjustments here if needed later
		}
	},
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
				sourceType: 'module'
			}
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parser: svelte.parser,
			parserOptions: {
				parser: ts.parser,
				project: './tsconfig.json', // Link to tsconfig for type info within <script>
				tsconfigRootDir: import.meta.dirname, // Root dir for tsconfig resolution
				extraFileExtensions: ['.svelte']
			}
		}
	},
	{
		ignores: [
			'**/*.cjs',
			'**/.DS_Store',
			'**/node_modules',
			'build',
			'.svelte-kit',
			'package',
			'dist',
			'**/.env',
			'**/.env.*',
			'!**/.env.example',
			'**/pnpm-lock.yaml',
			'**/package-lock.json',
			'**/yarn.lock'
		]
	}
);
