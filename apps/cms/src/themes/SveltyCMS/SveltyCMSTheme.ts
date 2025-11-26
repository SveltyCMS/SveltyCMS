/**
 * @file src/themes/SveltyCMS/SveltyCMSTheme.ts
 * @description SveltyCMS theme configuration.
 */

import type { CustomThemeConfig } from '@skeletonlabs/tw-plugin';

export const SveltyCMSTheme: CustomThemeConfig = {
	name: 'SveltyCMSTheme',
	properties: {
		// =~= Theme Properties =~=
		'--theme-font-family-base': `system-ui`,
		'--theme-font-family-heading': `system-ui`,
		'--theme-font-color-base': '0 0 0',
		'--theme-font-color-dark': '255 255 255',
		'--theme-rounded-base': '3px',
		'--theme-rounded-container': '3px',
		'--theme-border-base': '1px',
		// =~= Theme On-X Colors =~=
		'--on-primary': '255 255 255',
		'--on-secondary': '255 255 255',
		'--on-tertiary': '255 255 255',
		'--on-success': '255 255 255',
		'--on-warning': '255 255 255',
		'--on-error': '255 255 255',
		'--on-surface': '255 255 255',
		// =~= Theme Colors  =~=
		// primary | #5fd317
		'--color-primary-50': '231 248 220', // #e7f8dc
		'--color-primary-100': '223 246 209', // #dff6d1
		'--color-primary-200': '215 244 197', // #d7f4c5
		'--color-primary-300': '191 237 162', // #bfeda2
		'--color-primary-400': '143 224 93', // #8fe05d
		'--color-primary-500': '95 211 23', // #5fd317
		'--color-primary-600': '86 190 21', // #56be15
		'--color-primary-700': '71 158 17', // #479e11
		'--color-primary-800': '57 127 14', // #397f0e
		'--color-primary-900': '47 103 11', // #2f670b
		// secondary | #757575
		'--color-secondary-50': '234 234 234', // #eaeaea
		'--color-secondary-100': '227 227 227', // #e3e3e3
		'--color-secondary-200': '221 221 221', // #dddddd
		'--color-secondary-300': '200 200 200', // #c8c8c8
		'--color-secondary-400': '158 158 158', // #9e9e9e
		'--color-secondary-500': '117 117 117', // #757575
		'--color-secondary-600': '105 105 105', // #696969
		'--color-secondary-700': '88 88 88', // #585858
		'--color-secondary-800': '70 70 70', // #464646
		'--color-secondary-900': '57 57 57', // #393939
		// tertiary | #0078f0
		'--color-tertiary-50': '217 235 253', // #d9ebfd
		'--color-tertiary-100': '204 228 252', // #cce4fc
		'--color-tertiary-200': '191 221 251', // #bfddfb
		'--color-tertiary-300': '153 201 249', // #99c9f9
		'--color-tertiary-400': '77 161 245', // #4da1f5
		'--color-tertiary-500': '0 120 240', // #0078f0
		'--color-tertiary-600': '0 108 216', // #006cd8
		'--color-tertiary-700': '0 90 180', // #005ab4
		'--color-tertiary-800': '0 72 144', // #004890
		'--color-tertiary-900': '0 59 118', // #003b76
		// success | #2e7d32
		'--color-success-50': '224 236 224', // #e0ece0
		'--color-success-100': '213 229 214', // #d5e5d6
		'--color-success-200': '203 223 204', // #cbdfcc
		'--color-success-300': '171 203 173', // #abcbad
		'--color-success-400': '109 164 112', // #6da470
		'--color-success-500': '46 125 50', // #2e7d32
		'--color-success-600': '41 113 45', // #29712d
		'--color-success-700': '35 94 38', // #235e26
		'--color-success-800': '28 75 30', // #1c4b1e
		'--color-success-900': '23 61 25', // #173d19
		// warning | #f0c000
		'--color-warning-50': '253 246 217', // #fdf6d9
		'--color-warning-100': '252 242 204', // #fcf2cc
		'--color-warning-200': '251 239 191', // #fbefbf
		'--color-warning-300': '249 230 153', // #f9e699
		'--color-warning-400': '245 211 77', // #f5d34d
		'--color-warning-500': '240 192 0', // #f0c000
		'--color-warning-600': '216 173 0', // #d8ad00
		'--color-warning-700': '180 144 0', // #b49000
		'--color-warning-800': '144 115 0', // #907300
		'--color-warning-900': '118 94 0', // #765e00
		// error | #eb0000
		'--color-error-50': '252 217 217', // #fcd9d9
		'--color-error-100': '251 204 204', // #fbcccc
		'--color-error-200': '250 191 191', // #fabfbf
		'--color-error-300': '247 153 153', // #f79999
		'--color-error-400': '241 77 77', // #f14d4d
		'--color-error-500': '235 0 0', // #eb0000
		'--color-error-600': '212 0 0', // #d40000
		'--color-error-700': '176 0 0', // #b00000
		'--color-error-800': '141 0 0', // #8d0000
		'--color-error-900': '115 0 0', // #730000
		// surface | #242728
		'--color-surface-50': '222 223 223', // #dedfdf
		'--color-surface-100': '211 212 212', // #d3d4d4
		'--color-surface-200': '200 201 201', // #c8c9c9
		'--color-surface-300': '167 169 169', // #a7a9a9
		'--color-surface-400': '102 104 105', // #666869
		'--color-surface-500': '36 39 40', // #242728
		'--color-surface-600': '32 35 36', // #202324
		'--color-surface-700': '27 29 30', // #1b1d1e
		'--color-surface-800': '22 23 24', // #161718
		'--color-surface-900': '18 19 20' // #121314
	}
};
