// tests/bun/svelte-loader.js
import { plugin } from 'bun';
import { compile, preprocess } from 'svelte/compiler';
import { readFileSync } from 'fs';
import sveltePreprocess from 'svelte-preprocess';

const preprocessor = sveltePreprocess({
	typescript: {
		tsconfigFile: './tsconfig.json'
	}
});

plugin({
	name: 'svelte-loader',
	async setup(build) {
		const setupFile = async (args) => {
			const code = readFileSync(args.path, 'utf8');
			const preprocessed = await preprocess(code, preprocessor, {
				filename: args.path
			});
			const result = compile(preprocessed.code, {
				generate: 'ssr',
				filename: args.path
			});
			return {
				contents: result.js.code,
				loader: 'ts'
			};
		};
		// Only handle .svelte files, not .svelte.ts files
		build.onLoad({ filter: /\.svelte$/ }, setupFile);
	}
});
