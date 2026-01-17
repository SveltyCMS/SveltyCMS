import 'clsx';
import { n as noop } from './utils2.js';
import '@sveltejs/kit/internal/server';
const is_legacy = noop.toString().includes('$$') || /function \w+\(\) \{\}/.test(noop.toString());
if (is_legacy) {
	({
		data: {},
		form: null,
		error: null,
		params: {},
		route: { id: null },
		state: {},
		status: -1,
		url: new URL('https://example.com')
	});
}
//# sourceMappingURL=state.svelte.js.map
