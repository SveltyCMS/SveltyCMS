import { sveltePreprocess } from 'svelte-preprocess';
import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: sveltePreprocess(),
	kit: {
		adapter: adapter(),
		alias: {
			'$lib': './src/lib',
			'$shared': '../../shared'
		}
	}
};

export default config;
