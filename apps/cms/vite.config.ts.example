/**
 * @file apps/cms/vite.config.ts
 * @description Vite configuration for the CMS application
 * 
 * Extends the base configuration with CMS-specific plugins and optimizations.
 */

import { getBaseViteConfig, createPleskDeployPlugin } from '../../vite.config.base.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = getBaseViteConfig(__dirname, {
	// CMS runs on port 5174 (different from setup)
	port: 5174,
	
	// Additional plugins for CMS
	additionalPlugins: [
		createPleskDeployPlugin(__dirname)
	],
	
	// Build optimizations for CMS
	buildOptions: {
		rollupOptions: {
			output: {
				// Split large CMS dependencies into separate chunks
				manualChunks: {
					// Rich text editor
					'tiptap': [
						'@tiptap/core',
						'@tiptap/starter-kit',
						'@tiptap/extension-bullet-list',
						'@tiptap/extension-link',
						'@tiptap/extension-image',
						'@tiptap/extension-table'
					],
					// Charts and analytics
					'charts': [
						'chart.js',
						'chartjs-adapter-date-fns'
					],
					// Media handling
					'media': [
						'sharp',
						'konva',
						'pdfjs-dist'
					]
				}
			}
		}
	}
});

export default config;
