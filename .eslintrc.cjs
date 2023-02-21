module.exports = {
	root: true,
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
		'plugin:@typescript-eslint/recommended-requiring-type-checking',
		'prettier'
	],
	plugins: ['svelte3', '@typescript-eslint'],
	ignorePatterns: ['*.cjs'],
	overrides: [
		{
			files: ['*.svelte'],
			processor: 'svelte3/svelte3'
		}
	],
	settings: {
		'svelte3/typescript': () => require('typescript')
	},
	parser: '@typescript-eslint/parser',
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2020,
		tsconfigRootDir: __dirname,
		project: ['./tsconfig.json']
	},
	env: {
		browser: true,
		es2022: true,
		node: true
	},
	rules: {
		'@typescript-eslint/no-unused-vars': 'off'
	}
};
