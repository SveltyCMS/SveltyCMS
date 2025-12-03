import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';

/** @type {import('mdsvex').MdsvexOptions} */
const mdsvexOptions = {
	extensions: ['.md', '.mdx'],
	layout: {
		_: './src/lib/layouts/MdsvexLayout.svelte'
	},
	smartypants: {
		dashes: 'oldschool'
	},
	remarkPlugins: [],
	rehypePlugins: []
};

/** @type {import('@sveltejs/kit').Config} */
const config = {
	extensions: ['.svelte', '.md', '.mdx'],
	preprocess: [vitePreprocess(), mdsvex(mdsvexOptions)],

	kit: {
		adapter: adapter({
			out: 'build',
			precompress: false,
			envPrefix: ''
		}),
		alias: {
			'@src': './src/*',
			'@lib': './src/lib/*',
			'@components': './src/lib/components/*',
			'@stores': './src/lib/stores/*',
			'@utils': './src/lib/utils/*',
			'@static': '../static/',
			'@root': './'
		}
	},

	vitePlugin: {
		inspector: {
			toggleKeyCombo: 'meta-shift',
			holdMode: true,
			showToggleButton: 'always',
			toggleButtonPos: 'bottom-right'
		}
	}
};

export default config;
