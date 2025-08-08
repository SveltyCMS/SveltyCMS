import adapter from '@sveltejs/adapter-node'; // To generate a standalone Node server
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	// Enable runes mode across your entire SvelteKit app
	// compilerOptions: {
	// 	runes: true
	// },

	kit: {
		// See https://kit.svelte.dev/docs/adapters for more information about adapters.
		adapter: adapter({
			out: 'build', // default: true | The directory to build the server to
			precompress: false, // default: false | Enables precompressing using gzip & brotli for assets & prerendered pages
			envPrefix: '', // default: '' | If you need to change the name of the environment variables used to configure the deployment
			external: ['typescript', 'ts-node', '@typescript-eslint/parser', '@typescript-eslint/eslint-plugin'], // Prevent TypeScript and related modules from being bundled into the server
			polyfill: false // Disable polyfills as we handle them in Vite config
		}),
		csrf: {
			checkOrigin: false // default: true | Protection against cross-site request forgery (CSRF) attacks.
		},
		files: {
			// ... other file options
			routes: 'src/routes' // Make sure routes are in a folder named 'routes'
		},
		alias: {
			'@root': '.',
			'@src': './src',
			'@api': './src/routes/api',
			'@components': './src/components',
			'@collections': './config/collections',
			'@auth': './src/auth',
			'@databases': './src/databases',
			'@utils': './src/utils',
			'@stores': './src/stores',
			'@static': './static',
			$paraglide: './src/paraglide',
			'@types': './src/types',
			'@widgets': './src/widgets'
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
