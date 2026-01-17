import root from '../root.js';
import { set_building, set_prerendering } from '__sveltekit/environment';
import { set_assets } from '$app/paths/internal/server';
import { set_manifest, set_read_implementation } from '__sveltekit/server';
import { set_private_env, set_public_env } from '../../../../../node_modules/@sveltejs/kit/src/runtime/shared-server.js';

export const options = {
	app_template_contains_nonce: true,
	async: false,
	csp: {
		mode: 'nonce',
		directives: {
			'default-src': ['self'],
			'worker-src': ['self', 'blob:'],
			'connect-src': [
				'self',
				'https://*.iconify.design',
				'https://*.simplesvg.com',
				'https://*.unisvg.com',
				'https://code.iconify.design',
				'https://raw.githubusercontent.com',
				'wss:',
				'ws:'
			],
			'font-src': ['self', 'data:'],
			'img-src': [
				'self',
				'data:',
				'blob:',
				'https://*.iconify.design',
				'https://*.simplesvg.com',
				'https://*.unisvg.com',
				'https://placehold.co',
				'https://api.qrserver.com',
				'https://github.com',
				'https://raw.githubusercontent.com'
			],
			'object-src': ['none'],
			'script-src': ['self', 'unsafe-inline', 'unsafe-eval', 'blob:', 'https://*.iconify.design', 'https://code.iconify.design'],
			'style-src': ['self', 'unsafe-inline', 'https://*.iconify.design'],
			'base-uri': ['self'],
			'form-action': ['self'],
			'upgrade-insecure-requests': false,
			'block-all-mixed-content': false
		},
		reportOnly: { 'upgrade-insecure-requests': false, 'block-all-mixed-content': false }
	},
	csrf_check_origin: true,
	csrf_trusted_origins: [],
	embedded: false,
	env_public_prefix: 'PUBLIC_',
	env_private_prefix: '',
	hash_routing: false,
	hooks: null, // added lazily, via `get_hooks`
	preload_strategy: 'modulepreload',
	root,
	service_worker: false,
	service_worker_options: undefined,
	templates: {
		app: ({ head, body, assets, nonce, env }) =>
			'<!doctype html>\n<html lang="en" dir="ltr" class="dark">\n\t<head>\n\t\t<meta charset="utf-8" />\n\t\t<script nonce="' +
			nonce +
			"\">\n\t\t\t// Theme initialization (before page render to prevent flicker)\n\t\t\t(() => {\n\t\t\t\tconst c = document.cookie.match(/theme=(\\w+)/)?.[1];\n\t\t\t\tconst h = document.documentElement;\n\n\t\t\t\ttry {\n\t\t\t\t\t// Determine if dark mode should be active\n\t\t\t\t\tconst systemPrefersLight = matchMedia('(prefers-color-scheme: light)').matches;\n\t\t\t\t\tlet isDark = true; // Default to dark mode\n\n\t\t\t\t\tif (c === 'dark') {\n\t\t\t\t\t\tisDark = true;\n\t\t\t\t\t} else if (c === 'light') {\n\t\t\t\t\t\tisDark = false;\n\t\t\t\t\t} else if (c === 'system' || !c) {\n\t\t\t\t\t\t// Priority System: if system says light, use light. Otherwise default dark.\n\t\t\t\t\t\tisDark = !systemPrefersLight;\n\t\t\t\t\t}\n\n\t\t\t\t\tif (isDark) {\n\t\t\t\t\t\th.classList.add('dark');\n\t\t\t\t\t\th.classList.remove('light');\n\t\t\t\t\t} else {\n\t\t\t\t\t\th.classList.add('light');\n\t\t\t\t\t\th.classList.remove('dark');\n\t\t\t\t\t}\n\t\t\t\t} catch (e) {\n\t\t\t\t\tconsole.error('[SSR Script] Error:', e);\n\t\t\t\t}\n\t\t\t})();\n\t\t</script>\n\t\t<script src=\"https://code.iconify.design/iconify-icon/1.0.7/iconify-icon.min.js\"></script>\n\t\t<link rel=\"icon\" href=\"" +
			assets +
			'/SveltyCMS_Logo.svg" />\n\t\t<link rel="mask-icon" href="/safari-pinned-tab.svg" color="#5bbad5" />\n\n\t\t<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n\n\t\t' +
			head +
			'\n\t\t<!-- Custom CSS injection point for dynamic styles -->\n\t\t<style nonce="' +
			nonce +
			'">\n\t\t\t%sveltekit.customCss%\n\t\t</style>\n\t</head>\n\n\t<body data-sveltekit-preload-data="hover" data-theme="sveltycms">\n\t\t<div style="display: contents">' +
			body +
			'</div>\n\t</body>\n</html>\n',
		error: ({ status, message }) =>
			'<!doctype html>\n<html lang="en">\n\t<head>\n\t\t<meta charset="utf-8" />\n\t\t<title>' +
			message +
			"</title>\n\n\t\t<style>\n\t\t\tbody {\n\t\t\t\t--bg: white;\n\t\t\t\t--fg: #222;\n\t\t\t\t--divider: #ccc;\n\t\t\t\tbackground: var(--bg);\n\t\t\t\tcolor: var(--fg);\n\t\t\t\tfont-family:\n\t\t\t\t\tsystem-ui,\n\t\t\t\t\t-apple-system,\n\t\t\t\t\tBlinkMacSystemFont,\n\t\t\t\t\t'Segoe UI',\n\t\t\t\t\tRoboto,\n\t\t\t\t\tOxygen,\n\t\t\t\t\tUbuntu,\n\t\t\t\t\tCantarell,\n\t\t\t\t\t'Open Sans',\n\t\t\t\t\t'Helvetica Neue',\n\t\t\t\t\tsans-serif;\n\t\t\t\tdisplay: flex;\n\t\t\t\talign-items: center;\n\t\t\t\tjustify-content: center;\n\t\t\t\theight: 100vh;\n\t\t\t\tmargin: 0;\n\t\t\t}\n\n\t\t\t.error {\n\t\t\t\tdisplay: flex;\n\t\t\t\talign-items: center;\n\t\t\t\tmax-width: 32rem;\n\t\t\t\tmargin: 0 1rem;\n\t\t\t}\n\n\t\t\t.status {\n\t\t\t\tfont-weight: 200;\n\t\t\t\tfont-size: 3rem;\n\t\t\t\tline-height: 1;\n\t\t\t\tposition: relative;\n\t\t\t\ttop: -0.05rem;\n\t\t\t}\n\n\t\t\t.message {\n\t\t\t\tborder-left: 1px solid var(--divider);\n\t\t\t\tpadding: 0 0 0 1rem;\n\t\t\t\tmargin: 0 0 0 1rem;\n\t\t\t\tmin-height: 2.5rem;\n\t\t\t\tdisplay: flex;\n\t\t\t\talign-items: center;\n\t\t\t}\n\n\t\t\t.message h1 {\n\t\t\t\tfont-weight: 400;\n\t\t\t\tfont-size: 1em;\n\t\t\t\tmargin: 0;\n\t\t\t}\n\n\t\t\t@media (prefers-color-scheme: dark) {\n\t\t\t\tbody {\n\t\t\t\t\t--bg: #222;\n\t\t\t\t\t--fg: #ddd;\n\t\t\t\t\t--divider: #666;\n\t\t\t\t}\n\t\t\t}\n\t\t</style>\n\t</head>\n\t<body>\n\t\t<div class=\"error\">\n\t\t\t<span class=\"status\">" +
			status +
			'</span>\n\t\t\t<div class="message">\n\t\t\t\t<h1>' +
			message +
			'</h1>\n\t\t\t</div>\n\t\t</div>\n\t</body>\n</html>\n'
	},
	version_hash: '1az2z5o'
};

export async function get_hooks() {
	let handle;
	let handleFetch;
	let handleError;
	let handleValidationError;
	let init;
	({ handle, handleFetch, handleError, handleValidationError, init } = await import('../../../src/hooks.server.ts'));

	let reroute;
	let transport;

	return {
		handle,
		handleFetch,
		handleError,
		handleValidationError,
		init,
		reroute,
		transport
	};
}

export { set_assets, set_building, set_manifest, set_prerendering, set_private_env, set_public_env, set_read_implementation };
