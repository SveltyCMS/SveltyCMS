/**
 * @file postcss.config.cjs
 * @description This configuration file sets up PostCSS for the project. It specifies the
 * plugins to be used during the CSS processing pipeline, including Tailwind CSS v4.
 *
 * @exports
 * - plugins: An object defining the PostCSS plugins to be used.
 *   - @tailwindcss/postcss: Tailwind CSS v4 PostCSS plugin
 */

module.exports = {
	plugins: {
		'@tailwindcss/postcss': {}
	}
};
