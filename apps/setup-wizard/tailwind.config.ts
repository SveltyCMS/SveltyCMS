import { join } from 'path';
import type { Config } from 'tailwindcss';

import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';
import { skeleton } from '@skeletonlabs/tw-plugin';
import { SveltyCMSTheme } from '../cms/src/themes/SveltyCMS/SveltyCMSTheme';

const config = {
	darkMode: 'class',

	content: [
		'./src/**/*.{html,js,svelte,ts}',
		join(require.resolve('@skeletonlabs/skeleton'), '../**/*.{html,js,svelte,ts}')
	],

	theme: {
		extend: {
			screens: {
				xs: '360px',
				'max-xs': { max: '359px' },
				'max-sm': { max: '639px' },
				'max-md': { max: '767px' },
				'max-lg': { max: '1023px' },
				'max-xl': { max: '1279px' },
				'max-2xl': { max: '1535px' }
			}
		}
	},

	plugins: [
		forms,
		typography,
		skeleton({
			themes: {
				custom: [SveltyCMSTheme]
			}
		})
	]
} satisfies Config;

export default config;
