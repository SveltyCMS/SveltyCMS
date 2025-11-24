/**
 * @file tailwind.config.ts
 * @description Tailwind CSS v4 configuration for a SvelteKit project.
 * This file includes:
 * - Content paths for scanning
 * - Dark mode support via selector method
 * 
 * Note: Skeleton v4 uses CSS-based theming, so no plugin configuration needed.
 * Theme is defined in src/themes/SveltyCMS/SveltyCMSTheme.css
 */

import { join } from 'path';
import type { Config } from 'tailwindcss';

const config = {
	// Opt for dark mode to be handled via the selector method
	darkMode: 'selector',

	content: [
		'./src/**/*.{html,js,svelte,ts}',
		// Append Path for the Skeleton NPM package and files:
		join(require.resolve('@skeletonlabs/skeleton'), '../**/*.{html,js,svelte,ts}')
	]
} satisfies Config;

export default config;
