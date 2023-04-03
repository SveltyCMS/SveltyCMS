/**
 * @type {import("@inlang/core/config").DefineConfig}
 */
export async function defineConfig(env) {
	// initialize the plugin
	const plugin = await env.$import(
		'https://cdn.jsdelivr.net/gh/ivanhofer/inlang-plugin-typesafe-i18n/dist/index.js'
	);

	// get the locale information from `typesafe-i18n`
	const { base, locales } = await plugin.getLocaleInformation(env.$fs);

	return {
		referenceLanguage: base,
		languages: locales,
		readResources: (args) => plugin.readResources({ ...args, ...env }),
		writeResources: (args) => plugin.writeResources({ ...args, ...env })
	};
}
