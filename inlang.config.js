export async function defineConfig(env) {
	// importing the json plugin
	const plugin = await env.$import(
		'https://cdn.jsdelivr.net/gh/samuelstroschein/inlang-plugin-json@1/dist/index.js'
	);

	const pluginConfig = {
		pathPattern: '.inlang/{language}.json'
	};

	return {
		referenceLanguage: 'en',
		languages: await plugin.getLanguages({
			...env,
			pluginConfig
		}),
		readResources: (args) => plugin.readResources({ ...args, ...env, pluginConfig }),
		writeResources: (args) => plugin.writeResources({ ...args, ...env, pluginConfig })
	};
}
