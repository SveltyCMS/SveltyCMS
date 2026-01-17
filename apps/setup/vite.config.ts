/**
 * @file apps/setup/vite.config.ts
 * @description Vite configuration for the Setup wizard application
 */

import { defineConfig } from 'vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import path from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'url';
import { getBaseViteConfig } from '../../vite.config.base.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Plugin to create missing source map file to silence Vite warnings
const fixParaglideSourceMap = () => ({
	name: 'fix-paraglide-sourcemap',
	configureServer(server: any) {
		server.watcher.on('all', (event: string, filePath: string) => {
			if (filePath.includes('paraglide/runtime.js') && (event === 'add' || event === 'change')) {
				const mapPath = filePath.replace('runtime.js', 'strategy.js.map');
				setTimeout(() => {
					if (!fs.existsSync(mapPath)) {
						fs.writeFileSync(mapPath, '{"version":3,"file":"strategy.js","sources":[],"names":[],"mappings":""}');
					}
				}, 100);
			}
		});
	}
});

const baseConfig = getBaseViteConfig(__dirname, {
	port: Number(process.env.PORT) || 5173,
	additionalPlugins: [
		fixParaglideSourceMap(),
		paraglideVitePlugin({
			project: path.resolve(__dirname, '../../project.inlang'),
			outdir: path.resolve(__dirname, '../../shared/paraglide/src')
		})
	],
	optimizeDeps: {
		include: ['iconify-icon']
	}
});

export default defineConfig({
	...baseConfig,
	css: { devSourcemap: false },
	esbuild: { sourcemap: false },
	ssr: {
		noExternal: ['@skeletonlabs/skeleton-svelte', '@zag-js/svelte']
	},
	server: {
		...baseConfig.server,
		fs: {
			allow: ['../..']
		}
	}
});
