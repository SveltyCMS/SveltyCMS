/**
 * Post-install script to patch Skeleton v4 CSS for TailwindCSS v4 compatibility
 * Converts @variant directives to standard CSS media queries
 */

const fs = require('fs');
const path = require('path');

const skeletonCssPath = path.join(__dirname, '../node_modules/@skeletonlabs/skeleton/dist/index.css');

if (fs.existsSync(skeletonCssPath)) {
	console.log('Patching Skeleton CSS for TailwindCSS v4 compatibility...');
	
	let css = fs.readFileSync(skeletonCssPath, 'utf8');
	
	// Replace @variant dark with .dark selector
	css = css.replace(/@variant dark\s*{([^}]*)}/g, '.dark & {$1}');
	
	// Replace @variant md with media query
	css = css.replace(/@variant md\s*{([^}]*)}/g, '@media (min-width: 768px) {$1}');
	
	// Replace @variant sm with media query
	css = css.replace(/@variant sm\s*{([^}]*)}/g, '@media (min-width: 640px) {$1}');
	
	// Replace @variant lg with media query
	css = css.replace(/@variant lg\s*{([^}]*)}/g, '@media (min-width: 1024px) {$1}');
	
	// Replace @variant xl with media query
	css = css.replace(/@variant xl\s*{([^}]*)}/g, '@media (min-width: 1280px) {$1}');
	
	// Replace @variant 2xl with media query
	css = css.replace(/@variant 2xl\s*{([^}]*)}/g, '@media (min-width: 1536px) {$1}');
	
	fs.writeFileSync(skeletonCssPath, css, 'utf8');
	
	console.log('✓ Skeleton CSS patched successfully!');
} else {
	console.warn('⚠ Skeleton CSS not found, skipping patch');
}
