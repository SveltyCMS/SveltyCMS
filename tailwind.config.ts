/**
 * @file tailwind.config.ts
 * Tailwind CSS v4 configuration for SvelteKit.
 */
import type { Config } from 'tailwindcss';

const config = {
	// Use class-based dark mode toggle
	darkMode: 'class',

	// Tailwind v4 removes `content` and registers plugins via CSS `@plugin`
	// Keep only theme extensions here.
	theme: {
		extend: {
			screens: {
				// Custom breakpoints
				xs: '360px',
				'max-xs': { max: '359px' },
				'max-sm': { max: '639px' },
				'max-md': { max: '767px' },
				'max-lg': { max: '1023px' },
				'max-xl': { max: '1279px' },
				'max-2xl': { max: '1535px' }
			},
			fontFamily: {}
		}
	}
} satisfies Config;

export default config;
