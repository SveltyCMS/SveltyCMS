/**
 * @type {import("@inlang/core/config").DefineConfig}
 */
export async function defineConfig(env) {
  // initialize the plugin
  const { default: typesafeI18nPlugin } = await env.$import(
    "https://cdn.jsdelivr.net/gh/ivanhofer/inlang-plugin-typesafe-i18n@2/dist/index.js"
  )

  return {
    plugins: [typesafeI18nPlugin()],
  }
}
