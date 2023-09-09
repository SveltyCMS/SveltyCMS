import type { CustomThemeConfig } from '@skeletonlabs/tw-plugin';

export const SimpleCMSTheme: CustomThemeConfig = {
	name: 'SimpleCMSTheme',
	properties: {
		// =~= Theme Properties =~=
		'--theme-font-family-base': 'system-ui',
		'--theme-font-family-heading': 'system-ui',
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
		// primary | #64dd17
		'--color-primary-50': '232 250 220', // #e8fadc
		'--color-primary-100': '224 248 209', // #e0f8d1
		'--color-primary-200': '216 247 197', // #d8f7c5
		'--color-primary-300': '193 241 162', // #c1f1a2
		'--color-primary-400': '147 231 93', // #93e75d
		'--color-primary-500': '100 221 23', // #64dd17
		'--color-primary-600': '90 199 21', // #5ac715
		'--color-primary-700': '75 166 17', // #4ba611
		'--color-primary-800': '60 133 14', // #3c850e
		'--color-primary-900': '49 108 11', // #316c0b
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
		// warning | #fecb01
		'--color-warning-50': '255 247 217', // #fff7d9
		'--color-warning-100': '255 245 204', // #fff5cc
		'--color-warning-200': '255 242 192', // #fff2c0
		'--color-warning-300': '255 234 153', // #ffea99
		'--color-warning-400': '254 219 77', // #fedb4d
		'--color-warning-500': '254 203 1', // #fecb01
		'--color-warning-600': '229 183 1', // #e5b701
		'--color-warning-700': '191 152 1', // #bf9801
		'--color-warning-800': '152 122 1', // #987a01
		'--color-warning-900': '124 99 0', // #7c6300
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
		// surface | #242424
		'--color-surface-50': '222 222 222', // #dedede
		'--color-surface-100': '211 211 211', // #d3d3d3
		'--color-surface-200': '200 200 200', // #c8c8c8
		'--color-surface-300': '167 167 167', // #a7a7a7
		'--color-surface-400': '102 102 102', // #666666
		'--color-surface-500': '36 36 36', // #242424
		'--color-surface-600': '32 32 32', // #202020
		'--color-surface-700': '27 27 27', // #1b1b1b
		'--color-surface-800': '22 22 22', // #161616
		'--color-surface-900': '18 18 18' // #121212
	}
};
