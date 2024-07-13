import Path from 'path';
import { readFileSync } from 'fs';

import { purgeCss } from 'vite-plugin-tailwind-purgecss';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { paraglide } from '@inlang/paraglide-vite';

// Gets package.json version info on app start
// https://kit.svelte.dev/faq#read-package-jsonimport { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { compile } from './src/routes/api/compile/compile';
import { generateCollectionFieldTypes, generateCollectionTypes } from './src/utils/collectionTypes';

// Load package.json version info
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

// Get current file and directory info
const __filename = fileURLToPath(import.meta.url);
const __dirname = Path.dirname(__filename);
const parsed = Path.parse(__dirname);

// Define paths for collections
const collectionsFolderJS = '/' + __dirname.replace(parsed.root, '').replaceAll('\\', '/') + '/collections/';
const collectionsFolderTS = '/' + __dirname.replace(parsed.root, '').replaceAll('\\', '/') + '/src/collections/';

// Initial compilation of collections
compile({ collectionsFolderJS, collectionsFolderTS });

export default defineConfig({
	plugins: [
		sveltekit(),
		{
			name: 'vite:dynamic-collection-updater',
			transform(code, id) {
				if (id.endsWith('.svelte')) {
					return {};
				}
			},
			configureServer(server) {
				const handleFileChange = (path: string) => {
					if (/src[/\\]collections/.test(path)) {
						compile({ collectionsFolderJS, collectionsFolderTS });
						generateCollectionTypes();
						generateCollectionFieldTypes();
					}
				};

				const handleFieldTypeChange = (path: string) => {
					if (/src[/\\]collections/.test(path) && !path.includes('types.ts')) {
						generateCollectionFieldTypes();
					}
				};

				// Register file watchers for dynamic updates
				server.watcher.on('add', handleFileChange);
				server.watcher.on('unlink', handleFileChange);
				server.watcher.on('change', handleFieldTypeChange);
			},

			// Add Collections & environment variables
			config() {
				return {
					define: {
						'import.meta.env.collectionsFolderJS': JSON.stringify(collectionsFolderJS),
						'import.meta.env.collectionsFolderTS': JSON.stringify(collectionsFolderTS),
						'import.meta.env.root': JSON.stringify('/' + __dirname.replace(parsed.root, '').replaceAll('\\', '/'))
					}
				};
			},
			enforce: 'post'
		},
		purgeCss(),
		paraglide({
			project: './project.inlang', // Path to your inlang project
			outdir: './src/paraglide' // Output directory for generated files
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
