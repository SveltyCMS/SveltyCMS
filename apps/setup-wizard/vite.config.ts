import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/paraglide'
		})
	],
	server: {
		port: 5174,
		watch: {
			usePolling: true,
			interval: 1000,
			ignored: [
				'**/node_modules/**',
				'**/.git/**',
				'**/build/**',
				'**/.svelte-kit/**',
				'**/dist/**',
				'../../node_modules/**',
				'../../apps/cms/**',
				'../../apps/docs/**',
				'../../build/**',
				'../../compiledCollections/**',
				'../../config/private.ts'
			]
		},
		fs: {
			strict: false,
			allow: ['..']
		}
	}
});
