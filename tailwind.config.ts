/*
@file tailwind.config.ts
@component Tailwind CSS configuration
*/

import { join } from 'path';
import type { Config } from 'tailwindcss';
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';
import { skeleton } from '@skeletonlabs/skeleton/plugin';
import * as theme from './shared/theme/src/theme.json';

const config = {
	darkMode: 'class',
	content: ['./apps/**/*.{html,js,svelte,ts}', './libs/**/*.{html,js,svelte,ts}', './shared/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {}
	},
	plugins: [
		forms,
		typography,
		skeleton({
			text: 'sans-serif',
			themes: [theme]
		})
	]
} satisfies Config;

export default config;
