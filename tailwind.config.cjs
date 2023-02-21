/** @type {import('tailwindcss').Config} */
module.exports = {
	content: [
		'./src/**/*.{html,js,svelte,ts}',
		require('path').join(require.resolve('@skeletonlabs/skeleton'), '../**/*.{html,js,svelte,ts}')
	],
	theme: {
		extend: {},

		screens: {
			// Start with default and use xs/sm/md/lg/xl/2xl

			// min-width ----------------------------
			xs: '360px',
			// => @media (min-width: 360px) { ... }
			sm: '567px',
			// => @media (min-width: 576px) { ... }
			md: '768px',
			// => @media (min-width: 768px) { ... }
			lg: '992px',
			// => @media (min-width: 992px) { ... }
			xl: '1200px',
			// => @media (min-width: 1200px) { ... }
			'2xl': '1536px',
			// => @media (min-width: 1536px) { ... }

			// max-width ----------------------------
			'max-xs': { max: '360px' },
			// => @media (min-width: 360px) { ... }
			'max-sm': { max: '567px' },
			// => @media (min-width: 576px) { ... }
			'max-md': { max: '768px' },
			// => @media (min-width: 768px) { ... }
			'max-lg': { max: '992px' },
			// => @media (min-width: 992px) { ... }
			'max-xl': { max: '1200px' },
			// => @media (min-width: 1200px) { ... }
			'max-2xl': { max: '1536px' }
			// => @media (min-width: 1536px) { ... }
		}
	},
	plugins: [
		// Keep any existing plugins present and append the following:
		...require('@skeletonlabs/skeleton/tailwind/skeleton.cjs')(),
		require('@tailwindcss/forms'),
		require('@tailwindcss/typography'),
		require('@tailwindcss/line-clamp')
	],
	darkMode: 'class'
};
