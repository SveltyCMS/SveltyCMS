export async function defineConfig(env) {
	// importing the json plugin
	const plugin = await env.$import(
        "https://cdn.jsdelivr.net/gh/ivanhofer/inlang-plugin-typesafe-i18n/dist/index.js",
        )

	const pluginConfig = {
		pathPattern: "./{language}.json",
	}

	return {
		referenceLanguage: "en",
		languages: await plugin.getLanguages({
			...env,
			pluginConfig,
		}),
		readResources: (args) => plugin.readResources({ ...args, ...env, pluginConfig }),
		writeResources: (args) => plugin.writeResources({ ...args, ...env, pluginConfig }),
	}
}