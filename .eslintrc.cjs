module.exports = {
	root: true,
	env: {
		es2020: true,
		node: true
	},
	extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:svelte/recommended', 'prettier'],
	plugins: ['@typescript-eslint', 'prettier'],
	ignorePatterns: ['*.cjs'],
	parser: '@typescript-eslint/parser',
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2021,
		extraFileExtensions: ['.svelte'] // This is a required setting in `@typescript-eslint/parser` v4.24.0.
	},
	globals: {
		NodeJS: true,
		svelte: true,
		globalThis: 'readonly'
	},
	rules: {
		'prefer-const': 'error',
		'@typescript-eslint/no-explicit-any': 'off'
	},
	overrides: [
		{
			files: ['*.svelte'],
			extends: ['plugin:svelte/recommended', 'plugin:svelte/prettier'],
			env: {
				browser: true
			},
			parser: 'svelte-eslint-parser',

			// Parse the `<script>` in `.svelte` as TypeScript by adding the following configuration.
			parserOptions: {
				parser: '@typescript-eslint/parser'
			}
		}
	]
};
