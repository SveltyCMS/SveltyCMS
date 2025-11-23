/**
 * @file tailwind.config.ts
 * @description Tailwind CSS v4 configuration for SvelteKit project.
 * This file includes:
 * - Content paths for Tailwind to scan
 * - Custom responsive breakpoints
 * 
 * Note: In Tailwind v4, most configuration is done via CSS using @theme directive.
 * Theme colors, spacing, and plugins are configured in the CSS file.
 */

import type { Config } from 'tailwindcss';

const config: Config = {
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
			}
		}
	}
};

export default config;
