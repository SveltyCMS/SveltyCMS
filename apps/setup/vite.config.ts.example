/**
 * @file apps/setup/vite.config.ts
 * @description Vite configuration for the Setup wizard application
 * 
 * Extends the base configuration with minimal dependencies.
 * Setup wizard should be as lightweight as possible for first-time installation.
 */

import { getBaseViteConfig } from '../../vite.config.base.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = getBaseViteConfig(__dirname, {
	// Setup runs on default port 5173
	port: 5173,
	
	// Optimize for minimal bundle
	optimizeDeps: {
		// Exclude heavy dependencies not needed in setup
		exclude: [
			'@inlang/paraglide-js',
			'@tiptap/core',
			'chart.js',
			'sharp',
			'konva'
		]
	},
	
	// Build optimizations for setup
	buildOptions: {
		rollupOptions: {
			output: {
				// Minimal chunks for setup wizard
				manualChunks: {
					'setup-vendor': ['svelte', '@sveltejs/kit']
				}
			}
		}
	}
});

export default config;
