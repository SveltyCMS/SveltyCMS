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

const paths = {
	privateConfig: path.resolve(__dirname, '../../config/private.ts')
};

// Plugin to log all transformed modules
function moduleLoggingPlugin(): any {
	return {
		name: 'module-logging',
		transform(code: string, id: string) {
			if (!id.includes('node_modules')) {
				fs.appendFileSync(path.resolve(__dirname, 'transformed_modules.txt'), id + '\n');
			}
			return null;
		}
	};
}

// Plugin to handle missing private config during fresh setup
function setupWizardPlugin(): any {
	const virtualModuleId = '\0virtual:private-config';
	return {
		name: 'svelty-cms-setup-wizard',
		resolveId(id: string) {
			if (id === '@config/private' || id.includes('config/private')) {
				if (!fs.existsSync(paths.privateConfig)) {
					return virtualModuleId;
				}
			}
			return null;
		},
		load(id: string) {
			if (id === virtualModuleId) {
				return 'export const privateEnv = null;';
			}
			return null;
		}
	};
}

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
		moduleLoggingPlugin(),
		setupWizardPlugin(),
		// fixParaglideSourceMap(),
		paraglideVitePlugin({
			project: path.resolve(__dirname, 'project.inlang'),
			outdir: path.resolve(__dirname, 'src/lib/paraglide')
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
	build: {
		sourcemap: false,
		minify: 'esbuild'
	},
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
