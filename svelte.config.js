import adapter from '@sveltejs/adapter-node';
import preprocess from 'svelte-preprocess';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://github.com/sveltejs/svelte-preprocess
	// for more information about preprocessors
	preprocess: [
		preprocess({
			postcss: true
		})
	],

	kit: {
		adapter: adapter(),

		alias: {
			$i18n: 'src/lib/i18n',
			$src: 'src/'
		}
	},
	// remove inspector for production
	vitePlugin: {
		experimental: {
			inspector: {
				// change shortcut
				toggleKeyCombo: 'meta-shift',
				// hold and release key to toggle inspector mode
				holdMode: true,
				// show or hide the inspector option
				showToggleButton: 'always',
				// inspector position
				toggleButtonPos: 'bottom-right'
			}
		}
	}
};

export default config;
