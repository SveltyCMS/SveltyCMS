/**
 * @file tailwind.config.ts
 * @description Tailwind CSS configuration for a SvelteKit project.
 * This file includes:
 * - Dark mode support via class method
 * - Custom responsive breakpoints
 * - Integration of Tailwind plugins for forms and typography
 * - Configuration of the Skeleton plugin with a custom theme (SveltyCMSTheme)
 */

import type { Config } from 'tailwindcss';

// Import Custom Theme
import { SveltyCMSTheme } from './src/themes/SveltyCMS/SveltyCMSTheme';

const config = {
	// Opt for dark mode to be handled via the class method
	darkMode: 'class',

	content: [
		'./src/**/*.{html,js,svelte,ts}',
		// Append Path for the Skeleton NPM package and files:
		join(require.resolve('@skeletonlabs/skeleton'), '../**/*.{html,js,svelte,ts}')
	],

	theme: {
		// Extend the default theme with custom responsive breakpoints
		extend: {
			screens: {
				//----------------- min-width------------------------------------------------
				xs: '360px', // => @media (min-width: 360px) { ... }
				sm: '567px', // => @media (min-width: 576px) { ... }
				md: '768px', // => @media (min-width: 768px) { ... }
				lg: '992px', // => @media (min-width: 992px) { ... }
				xl: '1200px', // => @media (min-width: 1200px) { ... }
				'2xl': '1536px', // => @media (min-width: 1536px) { ... }

				//----------------- max-width------------------------------------------------
				'max-xs': { max: '360px' }, // => @media (min-width: 360px) { ... }
				'max-sm': { max: '567px' }, // => @media (min-width: 576px) { ... }
				'max-md': { max: '768px' }, // => @media (min-width: 768px) { ... }
				'max-lg': { max: '992px' }, // => @media (min-width: 992px) { ... }
				'max-xl': { max: '1200px' }, // => @media (min-width: 1200px) { ... }
				'max-2xl': { max: '1536px' } // => @media (min-width: 1536px) { ... }
			}
		}
	},

	plugins: [
		// Append the Skeleton plugin (after other plugins)

		SveltyCMSTheme
	]
} satisfies Config;

export default config;
