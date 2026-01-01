import adapter from '@sveltejs/adapter-node'; // To generate a standalone Node server
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [vitePreprocess()],

	// ✅ **ACTION REQUIRED**: Uncomment this to enable Svelte 5 runes mode!
	// This is essential for using the latest Svelte 5 features.
	// compilerOptions: {
	// 	runes: true
	// },

	kit: {
		// See https://kit.svelte.dev/docs/adapters for more information about adapters.
		adapter: adapter({
			out: 'build', // default: true | The directory to build the server to
			precompress: true, // ✅ Enables precompressing using gzip & brotli for assets & prerendered pages
			envPrefix: '', // default: '' | If you need to change the name of the environment variables used to configure the deployment
			external: ['typescript', 'ts-node', '@typescript-eslint/parser', '@typescript-eslint/eslint-plugin'], // Prevent TypeScript and related modules from being bundled into the server
			polyfill: false // Disable polyfills as we handle them in Vite config
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
				'script-src': ['self', 'unsafe-inline', 'unsafe-eval', 'blob:'],
				'worker-src': ['self', 'blob:'], // Allow workers from same origin and blob URLs
				'style-src': ['self', 'unsafe-inline'], // unsafe-inline for faster builds
				'img-src': [
					'self',
					'data:',
					'blob:',
					'https://api.iconify.design',
					'https://api.unisvg.com',
					'https://api.simplesvg.com',
					'https://placehold.co',
					'https://api.qrserver.com',
					'https://github.com',
					'https://raw.githubusercontent.com'
				],
				'font-src': ['self', 'data:'],
				'connect-src': [
					'self',
					'https://api.iconify.design',
					'https://raw.githubusercontent.com',
					'wss:',
					'ws:',
					'https://api.simplesvg.com',
					'https://api.unisvg.com'
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
