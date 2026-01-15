import adapter from '@sveltejs/adapter-node'; // To generate a standalone Node server
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [vitePreprocess()],

	// Enable Svelte 5 runes mode for better HMR and modern reactivity
	compilerOptions: {
		runes: true
	},

	kit: {
		// See https://kit.svelte.dev/docs/adapters for more information about adapters.
		adapter: adapter({
			out: 'build', // default: true | The directory to build the server to
			precompress: true, // ✅ Enables precompressing using gzip & brotli
			envPrefix: '' // default: ''
			// ❌ REMOVED: external (handled in vite.config.ts)
			// ❌ REMOVED: polyfill (no longer supported/needed)
		}),

		alias: {
			$paraglide: './src/paraglide',
			'@api': './src/routes/api',
			'@auth': './src/databases/auth',
			'@collections': './config/collections',
			'@config': './config',
			'@components': './src/components',
			'@content': './src/content',
			'@databases': './src/databases',
			'@hooks': './src/hooks',
			'@root': '.',
			'@services': './src/services',
			'@src': './src',
			'@static': './static',
			'@stores': './src/stores',
			'@themes': './src/themes',
			'@types': './src/types',
			'@utils': './src/utils',
			'@widgets': './src/widgets'
		},

		// Use SvelteKit's built-in CSP support
		csp: {
			mode: 'nonce', // Use nonce for inline scripts (not hash)
			directives: {
				'default-src': ['self'],
				// Allow SvelteKit's nonced inline scripts plus dev HMR
				// TEMPORARY DEBUG: Allow unsafe-eval/inline in production to rule out CSP issues
				'script-src': ['self', 'unsafe-inline', 'unsafe-eval', 'blob:', 'https://*.iconify.design', 'https://code.iconify.design'],
				'worker-src': ['self', 'blob:'], // Allow workers from same origin and blob URLs
				'style-src': ['self', 'unsafe-inline', 'https://*.iconify.design'], // unsafe-inline for faster builds
				'img-src': [
					'self',
					'data:',
					'blob:',
					'https://*.iconify.design',
					'https://*.simplesvg.com',
					'https://*.unisvg.com',
					'https://placehold.co',
					'https://api.qrserver.com',
					'https://github.com',
					'https://raw.githubusercontent.com'
				],
				'font-src': ['self', 'data:'],
				'connect-src': [
					'self',
					'https://*.iconify.design',
					'https://*.simplesvg.com',
					'https://*.unisvg.com',
					'https://code.iconify.design',
					'https://raw.githubusercontent.com',
					'wss:',
					'ws:'
				],
				'object-src': ['none'],
				'base-uri': ['self'],
				'form-action': ['self']
			}
		}
	},

	// plugin options
	vitePlugin: {
		// remove inspector for production
		inspector: {
			// change shortcut
			toggleKeyCombo: 'meta-shift',
			// hold and release key to toggle inspector mode
			holdMode: true,
			// show or hide the inspector option
			showToggleButton: 'always',
			// inspector position
			toggleButtonPos: 'bottom-right'
		},
		// experimental options
		experimental: {}
	}
};

export default config;
