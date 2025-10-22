/**
 * @sveltycms/shared-theme
 *
 * Shared Tailwind CSS v4 + Skeleton v4 theme for all SveltyCMS applications
 *
 * Usage in apps:
 *
 * // In +layout.svelte:
 * import '@sveltycms/shared-theme/app.css';
 *
 * // In tailwind.config.ts (optional):
 * import { createAppConfig } from '@sveltycms/shared-theme';
 * export default createAppConfig(['./src/**\/*.{html,js,svelte,ts}']);
 *
 * // In vite.config.ts:
 * import tailwindcss from '@tailwindcss/vite';
 * plugins: [sveltekit(), tailwindcss()]
 */

export { SveltyCMSTheme, default as theme } from './theme.ts';
export { sharedTailwindConfig, sharedContent, createAppConfig } from './tailwind.config.ts';
export { default as postcssConfig } from './postcss.config.js';
