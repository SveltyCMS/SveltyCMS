/**
 * @file postcss.config.cjs
 * @description This configuration file sets up PostCSS for the project. It specifies the
 * plugins to be used during the CSS processing pipeline, including Tailwind CSS and
 * Autoprefixer.
 *
 * @exports
 * - plugins: An object defining the PostCSS plugins to be used.
 *   - tailwindcss: Integrates Tailwind CSS for utility-first styling.
 *   - autoprefixer: Automatically adds vendor prefixes to CSS rules for cross-browser compatibility.
 */

module.exports = {
	plugins: {
		tailwindcss: {},
		autoprefixer: {}
	}
};
