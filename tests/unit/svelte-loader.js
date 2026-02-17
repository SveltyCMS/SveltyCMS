// tests/bun/svelte-loader.js

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { plugin } from 'bun';
import { compile, compileModule, preprocess } from 'svelte/compiler';
import sveltePreprocess from 'svelte-preprocess';

// --- Read and process tsconfig paths ---
const projectRoot = process.cwd();
const tsconfigPath = resolve(projectRoot, '.svelte-kit/tsconfig.json');
let pathAliases = {};
try {
	const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
	pathAliases = tsconfig.compilerOptions.paths;
} catch (e) {
	console.error('Could not read path aliases from .svelte-kit/tsconfig.json.', e);
}
const tsconfigDir = dirname(tsconfigPath);

// --- Create a specific filter for path aliases ---
const aliasKeys = Object.keys(pathAliases);
const aliasFilter = new RegExp(`^(${aliasKeys.map((k) => k.replace('/*', '')).join('|')})`);

const preprocessor = sveltePreprocess({
	typescript: {
		tsconfigFile: './tsconfig.json'
	}
});

plugin({
	name: 'svelte-loader-with-paths',
	async setup(build) {
		// Handler for .svelte files
		const setupSvelteFile = async (args) => {
			const code = readFileSync(args.path, 'utf8');
			const preprocessed = await preprocess(code, preprocessor, {
				filename: args.path
			});
			const result = compile(preprocessed.code, {
				generate: 'ssr',
				filename: args.path,
				runes: true
			});
			return {
				contents: result.js.code,
				loader: 'js'
			};
		};

		// Handler for .svelte.ts files
		const setupSvelteTsFile = async (args) => {
			const code = readFileSync(args.path, 'utf8');

			// 1. Transpile TypeScript to JavaScript using Bun
			// eslint-disable-next-line no-undef
			const transpiler = new Bun.Transpiler({ loader: 'ts' });
			const jsCode = await transpiler.transform(code);

			// 2. Compile Svelte Runes
			const result = compileModule(jsCode, {
				generate: 'server',
				filename: args.path,
				runes: true
			});

			return {
				contents: result.js.code,
				loader: 'js'
			};
		};

		build.onLoad({ filter: /\.svelte$/ }, setupSvelteFile);
		build.onLoad({ filter: /\.svelte\.ts$/ }, setupSvelteTsFile);

		// --- Resolver with File URL conversion ---
		build.onResolve({ filter: aliasFilter }, (args) => {
			const { path: importPath } = args;

			for (const alias in pathAliases) {
				if (!Object.hasOwn(pathAliases, alias)) continue;
				const aliasTarget = pathAliases[alias][0];
				let resolvedPath = '';

				if (alias.endsWith('/*')) {
					const aliasPrefix = alias.slice(0, -2);
					if (importPath.startsWith(aliasPrefix)) {
						const pathSuffix = importPath.slice(aliasPrefix.length);
						const cleanSuffix = pathSuffix.startsWith('/') ? pathSuffix.slice(1) : pathSuffix;
						resolvedPath = resolve(tsconfigDir, aliasTarget.slice(0, -2), cleanSuffix);
					}
				} else if (importPath === alias) {
					resolvedPath = resolve(tsconfigDir, aliasTarget);
				}

				if (resolvedPath) {
					try {
						const tsPath = `${resolvedPath}.ts`;
						readFileSync(tsPath);
						return { path: pathToFileURL(tsPath).href };
					} catch {
						try {
							const jsPath = `${resolvedPath}.js`;
							readFileSync(jsPath);
							return { path: pathToFileURL(jsPath).href };
						} catch {
							return { path: pathToFileURL(resolvedPath).href };
						}
					}
				}
			}
		});
	}
});
