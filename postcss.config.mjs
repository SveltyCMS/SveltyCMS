import postcssImport from 'postcss-import';
import tailwindcss from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';

export default {
	plugins: [
		postcssImport({
			filter: (id) => {
				// Exclude all Skeleton packages and JavaScript files from PostCSS processing
				if (id.includes('@skeletonlabs/skeleton')) {
					return false;
				}
				return !id.endsWith('.js') && !id.endsWith('.mjs') && !id.endsWith('.ts');
			}
		}),
		tailwindcss(),
		autoprefixer()
	]
};