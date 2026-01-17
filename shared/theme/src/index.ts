/**
 * @file shared/theme/src/index.ts
 * @description Theme Library
 *
 * TailwindCSS and Skeleton UI v4 configuration.
 * Apps can extend or override as needed.
 * Ready for Skeleton UI v5 migration per app.
 */

export const themeConfig = {
	skeleton: {
		version: 4
	},
	tailwind: {
		darkMode: 'class'
	}
};

export { themeConfig as default };
import theme from './theme.json';
export { theme };
