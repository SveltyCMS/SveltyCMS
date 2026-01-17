import * as server from '../entries/pages/config/_page.server.ts.js';

export const index = 6;
let component_cache;
export const component = async () => (component_cache ??= (await import('../entries/pages/config/_page.svelte.js')).default);
export { server };
export const server_id = 'src/routes/config/+page.server.ts';
export const imports = [
	'_app/immutable/nodes/6.6auL1Bzq.js',
	'_app/immutable/chunks/zi73tRJP.js',
	'_app/immutable/chunks/DrlZFkx8.js',
	'_app/immutable/chunks/rsSWfq8L.js',
	'_app/immutable/chunks/CTjXDULS.js',
	'_app/immutable/chunks/CMZtchEj.js',
	'_app/immutable/chunks/DhHAlOU0.js',
	'_app/immutable/chunks/BXe5mj2j.js',
	'_app/immutable/chunks/MEFvoR_D.js',
	'_app/immutable/chunks/C6jjkVLf.js',
	'_app/immutable/chunks/DePHBZW_.js',
	'_app/immutable/chunks/DvgRl2rN.js',
	'_app/immutable/chunks/-PV6rnhC.js',
	'_app/immutable/chunks/BvngfGKt.js',
	'_app/immutable/chunks/BRE7FZu4.js',
	'_app/immutable/chunks/Ds4HF5TW.js',
	'_app/immutable/chunks/0XeaN6pZ.js',
	'_app/immutable/chunks/CxX94NXM.js',
	'_app/immutable/chunks/DHPSYX_z.js',
	'_app/immutable/chunks/B17Q6ahh.js',
	'_app/immutable/chunks/XmViZn7X.js',
	'_app/immutable/chunks/N8Jg0v49.js',
	'_app/immutable/chunks/BKIh0tuc.js'
];
export const stylesheets = [];
export const fonts = [];
