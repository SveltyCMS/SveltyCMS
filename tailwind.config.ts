/**
 * @file tailwind.config.ts
 * @description Tailwind CSS v4 configuration for a SvelteKit project.
 * This file includes:
 * - Content paths for scanning
 * - Dark mode support via class method
 * - Integration of Skeleton plugin with custom theme
 */

import { join } from 'path';
import type { Config } from 'tailwindcss';

// Import the Skeleton plugin
import { skeleton } from '@skeletonlabs/tw-plugin';
// Import Custom Theme
import { SveltyCMSTheme } from './src/themes/SveltyCMS/SveltyCMSTheme';

const config = {
	// Opt for dark mode to be handled via the class method
	darkMode: 'selector',

	content: [
		'./src/**/*.{html,js,svelte,ts}',
		// Append Path for the Skeleton NPM package and files:
		join(require.resolve('@skeletonlabs/skeleton'), '../**/*.{html,js,svelte,ts}')
	],

	plugins: [
		// Skeleton plugin with custom theme
		skeleton({
			themes: {
				custom: [SveltyCMSTheme]
			}
		})
	]
} satisfies Config;

export default config;
