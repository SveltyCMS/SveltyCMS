import * as server from '../entries/pages/login/oauth/_page.server.ts.js';

export const index = 20;
let component_cache;
export const component = async () => (component_cache ??= (await import('../entries/pages/login/oauth/_page.svelte.js')).default);
export { server };
export const server_id = 'src/routes/login/oauth/+page.server.ts';
export const imports = [
	'_app/immutable/nodes/20.B6lMiz5z.js',
	'_app/immutable/chunks/zi73tRJP.js',
	'_app/immutable/chunks/DrlZFkx8.js',
	'_app/immutable/chunks/rsSWfq8L.js',
	'_app/immutable/chunks/CTjXDULS.js',
	'_app/immutable/chunks/MEFvoR_D.js',
	'_app/immutable/chunks/Du7BI3HQ.js',
	'_app/immutable/chunks/B9MNxn3G.js',
	'_app/immutable/chunks/DePHBZW_.js',
	'_app/immutable/chunks/DvgRl2rN.js',
	'_app/immutable/chunks/C9E6SjbS.js',
	'_app/immutable/chunks/BvngfGKt.js',
	'_app/immutable/chunks/BvX3twhQ.js',
	'_app/immutable/chunks/XmViZn7X.js',
	'_app/immutable/chunks/N8Jg0v49.js',
	'_app/immutable/chunks/BKIh0tuc.js',
	'_app/immutable/chunks/DE21BT69.js',
	'_app/immutable/chunks/D4QnGYgQ.js',
	'_app/immutable/chunks/YQp2a1pQ.js',
	'_app/immutable/chunks/7IKENDK9.js'
];
export const stylesheets = [];
export const fonts = [];
