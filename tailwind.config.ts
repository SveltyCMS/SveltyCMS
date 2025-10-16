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

// Import Tailwind plugins
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';


const config = {
	// Opt for dark mode to be handled via the class method
	darkMode: 'class',

    content: ['./src/**/*.{html,js,svelte,ts}'],

	theme: {
		extend: {
			screens: {
				// Custom breakpoints (Tailwind defaults: sm:640px, md:768px, lg:1024px, xl:1280px, 2xl:1536px)
				xs: '360px', // => @media (min-width: 360px) { ... } - Custom extra small breakpoint

				//----------------- max-width utilities------------------------------------------------
				'max-xs': { max: '359px' }, // => @media (max-width: 359px) { ... }
				'max-sm': { max: '639px' }, // => @media (max-width: 639px) { ... }
				'max-md': { max: '767px' }, // => @media (max-width: 767px) { ... }
				'max-lg': { max: '1023px' }, // => @media (max-width: 1023px) { ... }
				'max-xl': { max: '1279px' }, // => @media (max-width: 1279px) { ... }
				'max-2xl': { max: '1535px' } // => @media (max-width: 1535px) { ... }
			},
			fontFamily: {}
		}
	},

    plugins: [
        forms,
        typography
    ]
} satisfies Config;

export default config;
