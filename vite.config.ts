import { sveltekit } from '@sveltejs/kit/vite';

// Import package.json version
import { readFileSync } from 'fs';
const json = readFileSync('package.json', 'utf8');
const pkg = JSON.parse(json);

/** @type {import('vite').UserConfig} */
const config = {
	plugins: [sveltekit()],
	define: {
		__PACKAGE__: pkg
	},
	output: { preloadStrategy: 'preload-mjs' }
};

export default config;
