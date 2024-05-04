import { purgeCss } from 'vite-plugin-tailwind-purgecss';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { paraglide } from '@inlang/paraglide-js-adapter-vite';

// Gets package.json version info on app start
// https://kit.svelte.dev/faq#read-package-json
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { compile } from './src/routes/api/compile/compile';
import { generateCollectionFieldTypes, generateCollectionTypes } from './src/utils/collectionTypes';

//github Version package.json check
//const file = fileURLToPath(new URL('package.json', import.meta.url));
const json = readFileSync('package.json', 'utf8');
const pkg = JSON.parse(json);

// Dynamic collection updater
// import type vite from 'vite';
import Path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = Path.dirname(__filename);
const parsed = Path.parse(__dirname);

const collectionsFolderJS = '/' + __dirname.replace(parsed.root, '').replaceAll('\\', '/') + '/collections/';
const collectionsFolderTS = '/' + __dirname.replace(parsed.root, '').replaceAll('\\', '/') + '/src/collections/';

compile({ collectionsFolderJS, collectionsFolderTS });

export default defineConfig({
	plugins: [
		sveltekit(),
		{
			name: 'vite:server',
			transform(code, id) {
				if (id.endsWith('.svelte')) {
					return {};
				}
			},
			configureServer(server) {
				const cb = (path: string) => {
					if (!/src[/\\]collections/.test(path)) {
						return;
					}

					compile({ collectionsFolderJS, collectionsFolderTS });
					generateCollectionTypes();
					generateCollectionFieldTypes();
				};
				server.watcher.on('add', cb);
				server.watcher.on('unlink', cb);
				server.watcher.on('change', (path) => {
					if (!/src[/\\]collections/.test(path) || path.includes('types.ts')) {
						return;
					}

					generateCollectionFieldTypes();
				});
			},

			async config() {
				return {
					define: {
						'import.meta.env.collectionsFolderJS': JSON.stringify(collectionsFolderJS),
						'import.meta.env.collectionsFolderTS': JSON.stringify(collectionsFolderTS)
					}
				};
			},
			enforce: 'post'
		},
		purgeCss(),
		paraglide({
			project: './project.inlang', // Path to your inlang project
			outdir: './src/paraglide' // Where you want the generated files to be placed
		})
	],

	server: {
		fs: { allow: ['static', '.'] }
	},

	define: {
		__VERSION__: JSON.stringify(pkg.version),
		SUPERFORMS_LEGACY: true
	}
});
