import adapter from '@sveltejs/adapter-node'; // To generate a standalone Node server
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	// ✅ **ACTION REQUIRED**: Uncomment this to enable Svelte 5 runes mode!
	// This is essential for using the latest Svelte 5 features.
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

		// Removed deprecated kit.files.routes override (default 'src/routes' is used)
		alias: {
			'@root': '.',
			'@src': './src',
			'@api': './src/routes/api',
			'@components': './src/components',
			'@collections': './config/collections',
			'@auth': './src/databases/auth',
			'@databases': './src/databases',
			'@utils': './src/utils',
			'@stores': './src/stores',
			'@content': './src/content',
			'@themes': './src/themes',
			'@hooks': './src/hooks',
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
