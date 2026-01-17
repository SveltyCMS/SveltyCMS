import * as server from '../entries/pages/config/systemsetting/_page.server.ts.js';

export const index = 13;
let component_cache;
export const component = async () => (component_cache ??= (await import('../entries/pages/config/systemsetting/_page.svelte.js')).default);
export { server };
export const server_id = 'src/routes/config/systemsetting/+page.server.ts';
export const imports = [
	'_app/immutable/nodes/13.ZVoYUEL2.js',
	'_app/immutable/chunks/zi73tRJP.js',
	'_app/immutable/chunks/DrlZFkx8.js',
	'_app/immutable/chunks/rsSWfq8L.js',
	'_app/immutable/chunks/CTjXDULS.js',
	'_app/immutable/chunks/CMZtchEj.js',
	'_app/immutable/chunks/DhHAlOU0.js',
	'_app/immutable/chunks/Bo6_hfUt.js',
	'_app/immutable/chunks/BXe5mj2j.js',
	'_app/immutable/chunks/DePHBZW_.js',
	'_app/immutable/chunks/DvgRl2rN.js',
	'_app/immutable/chunks/CxX94NXM.js',
	'_app/immutable/chunks/DHPSYX_z.js',
	'_app/immutable/chunks/B17Q6ahh.js',
	'_app/immutable/chunks/XmViZn7X.js',
	'_app/immutable/chunks/C6jjkVLf.js',
	'_app/immutable/chunks/MEFvoR_D.js',
	'_app/immutable/chunks/-PV6rnhC.js',
	'_app/immutable/chunks/BvngfGKt.js',
	'_app/immutable/chunks/BRE7FZu4.js',
	'_app/immutable/chunks/eT0aqHlv.js',
	'_app/immutable/chunks/D4QnGYgQ.js',
	'_app/immutable/chunks/C-hhfhAN.js',
	'_app/immutable/chunks/C9E6SjbS.js',
	'_app/immutable/chunks/DvhDKI5Z.js',
	'_app/immutable/chunks/Cl42wY7v.js',
	'_app/immutable/chunks/GeUt2_20.js',
	'_app/immutable/chunks/N8Jg0v49.js',
	'_app/immutable/chunks/BKIh0tuc.js',
	'_app/immutable/chunks/IGLJqrie.js'
];
export const stylesheets = [];
export const fonts = [];
