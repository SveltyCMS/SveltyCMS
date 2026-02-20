import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		files: ['**/*.svelte'],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
				NodeJS: true,
				svelte: true,
				globalThis: 'readonly'
			},
			parserOptions: {
				parser: ts.parser,
				extraFileExtensions: ['.svelte']
			}
		},
		rules: {
			'svelte/no-navigation-without-resolve': 'off',
			'svelte/require-each-key': 'off',
			'svelte/valid-compile': 'warn',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unused-vars': 'off'
		}
	},
	{
		ignores: ['src/paraglide/**', 'build', '.svelte-kit', 'package', 'dist', 'node_modules']
	}
);
