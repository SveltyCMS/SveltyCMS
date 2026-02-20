const fs = require('fs');
const path = require('path');

const walkDir = (dir) => {
	if (!fs.existsSync(dir)) return;
	fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules' || entry.name === '.svelte-kit' || entry.name === '.git') return;
			walkDir(fullPath);
		} else if (/\.(svelte|ts|js)$/.test(entry.name)) {
			let content = fs.readFileSync(fullPath, 'utf8');
			let originalContent = content;

			// Helper to convert PascalCase/camelCase to kebab-case for filenames
			const toKebab = (str) => {
				return str
					.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
					.replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
					.toLowerCase()
					.replace(/^-/, '');
			};

			// Pattern 1: Any import/from that looks like a path but ends in a PascalCase filename
			// Matches: @components/MyComponent.svelte, ./MyUtils.ts, ../Folder/File
			content = content.replace(/(from|import)\s+(['"])([^'"]+?\/)([^'"]+?)(?:\.svelte)?(['"])/g, (match, p1, q1, pathPart, filename, q2) => {
				// Skip external packages
				if (pathPart.startsWith('.') || pathPart.startsWith('@')) {
					const kebab = toKebab(filename);
					if (kebab !== filename) {
						// Re-attach .svelte if it was there or if path indicates a component
						const ext = match.includes('.svelte') ? '.svelte' : '';
						return `${p1} ${q1}${pathPart}${kebab}${ext}${q2}`;
					}
				}
				return match;
			});

			// Pattern 2: Fix casing specifically for common system components that shifted
			content = content.replace(/@components\/system\/inputs\/Input\.svelte/g, '@components/system/inputs/input.svelte');
			content = content.replace(/@components\/system\/inputs\/Toggles\.svelte/g, '@components/system/inputs/toggles.svelte');
			content = content.replace(/@src\/components\/Autocomplete\.svelte/g, '@src/components/autocomplete.svelte');

			if (content !== originalContent) {
				console.log(`Fixed imports in: ${fullPath}`);
				fs.writeFileSync(fullPath, content);
			}
		}
	});
};

console.log('🚀 Starting deep import fix (enforcing kebab-case paths)...');
walkDir('src');
walkDir('tests');
walkDir('config');
console.log('✅ Deep import fix complete.');
