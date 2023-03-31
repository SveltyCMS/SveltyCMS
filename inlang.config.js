// filename: inlang.config.js

/**
 * @type {import("@inlang/core/config").DefineConfig}
 */
export async function defineConfig(env) {
    /**
     * @type {import("typesafe-i18n/config")}
     */
    const { getLocaleInformation } = await env.$import("https://cdn.jsdelivr.net/npm/typesafe-i18n@5.20.0/config/index.mjs")
  
    // initialize the plugin
    const plugin = await env.$import(
      "https://cdn.jsdelivr.net/gh/ivanhofer/inlang-plugin-typesafe-i18n/dist/index.js"
    )
  
    // get the locale information from `typesafe-i18n`
    const { base, locales } = await getLocaleInformation(env.$fs)
  
    return {
      referenceLanguage: base,
      languages: locales,
      readResources: (args) =>
        plugin.readResources({ ...args, ...env }),
      writeResources: (args) =>
        plugin.writeResources({ ...args, ...env }),
    }
}