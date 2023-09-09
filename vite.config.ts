import { purgeCss } from 'vite-plugin-tailwind-purgecss';
import { sveltekit } from '@sveltejs/kit/vite';

// Gets package.json version info on app start
// https://kit.svelte.dev/faq#read-package-json
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { compile } from './src/routes/api/compile/compile';

//github Version package.json check
//const file = fileURLToPath(new URL('package.json', import.meta.url));
const json = readFileSync('package.json', 'utf8');
const pkg = JSON.parse(json);

// Dynamic collection updater
import type vite from 'vite';
import Path from 'path';

const file = fileURLToPath(new URL('package.json', import.meta.url));

const __filename = fileURLToPath(import.meta.url);
const __dirname = Path.dirname(__filename);
const parsed = Path.parse(__dirname);

const collectionsFolderJS =
	'/' + __dirname.replace(parsed.root, '').replaceAll('\\', '/') + '/collections/';
const collectionsFolderTS =
	'/' + __dirname.replace(parsed.root, '').replaceAll('\\', '/') + '/src/collections/';

compile({ collectionsFolderJS, collectionsFolderTS });

const config = {
	plugins: [
		{
			name: 'vite:server',
			config() {
				return {
					define: {
						'import.meta.env.collectionsFolderJS': JSON.stringify(collectionsFolderJS),
						'import.meta.env.collectionsFolderTS': JSON.stringify(collectionsFolderTS)
					}
				};
			}
		},
		sveltekit(),
		purgeCss()
	],

	server: { fs: { allow: ['static', '.'] } },

	resolve: {
		alias: {
			'@src': Path.resolve('src/'),
			'@static': Path.resolve('static/'),
			'@root': Path.resolve('./'),
			'@i18n': Path.resolve('src/i18n')
		}
	},

	define: {
		__VERSION__: JSON.stringify(pkg.version)
	},

	output: { preloadStrategy: 'preload-mjs' }
} as vite.UserConfig;

export default config;
