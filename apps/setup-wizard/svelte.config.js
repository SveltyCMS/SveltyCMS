import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		alias: {
			$paraglide: './src/paraglide',
			'@api': './src/routes/api',
			'@collections': '../../config/collections',
			'@config': '../../config',
			'@components': '../cms/src/components',
			'@databases': '../cms/src/databases',
			'@root': '../..',
			'@services': '../cms/src/services',
			'@src': '../cms/src',
			'@stores': '../cms/src/stores',
			'@utils': '../shared-utils',
			'@sveltycms/shared-config': '../shared-config'
		}
	}
};

export default config;
