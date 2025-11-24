/**
 * @file postcss.config.cjs
 * @description This configuration file sets up PostCSS for the project with TailwindCSS v4.
 * Note: TailwindCSS v4 includes autoprefixer built-in, so it's no longer needed as a separate plugin.
 *
 * @exports
 * - plugins: An object defining the PostCSS plugins to be used.
 *   - @tailwindcss/postcss: TailwindCSS v4 PostCSS plugin
 */

module.exports = {
	plugins: {
		'@tailwindcss/postcss': {}
	}
};
