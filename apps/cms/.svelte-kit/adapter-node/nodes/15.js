import * as server from '../entries/pages/config/widgetManagement/_page.server.ts.js';

export const index = 15;
let component_cache;
export const component = async () => (component_cache ??= (await import('../entries/pages/config/widgetManagement/_page.svelte.js')).default);
export { server };
export const server_id = 'src/routes/config/widgetManagement/+page.server.ts';
export const imports = [
	'_app/immutable/nodes/15.BkKp4AUv.js',
	'_app/immutable/chunks/zi73tRJP.js',
	'_app/immutable/chunks/DrlZFkx8.js',
	'_app/immutable/chunks/rsSWfq8L.js',
	'_app/immutable/chunks/CTjXDULS.js',
	'_app/immutable/chunks/C6jjkVLf.js',
	'_app/immutable/chunks/DhHAlOU0.js',
	'_app/immutable/chunks/BXe5mj2j.js',
	'_app/immutable/chunks/MEFvoR_D.js',
	'_app/immutable/chunks/DePHBZW_.js',
	'_app/immutable/chunks/DvgRl2rN.js',
	'_app/immutable/chunks/-PV6rnhC.js',
	'_app/immutable/chunks/BvngfGKt.js',
	'_app/immutable/chunks/BRE7FZu4.js',
	'_app/immutable/chunks/CMZtchEj.js',
	'_app/immutable/chunks/D4QnGYgQ.js',
	'_app/immutable/chunks/vkx2g0aB.js',
	'_app/immutable/chunks/DOA-aSm7.js',
	'_app/immutable/chunks/0XeaN6pZ.js',
	'_app/immutable/chunks/BEiD40NV.js',
	'_app/immutable/chunks/YQp2a1pQ.js',
	'_app/immutable/chunks/N8Jg0v49.js',
	'_app/immutable/chunks/BKIh0tuc.js',
	'_app/immutable/chunks/Ccw7PXcW.js',
	'_app/immutable/chunks/BSPmpUse.js',
	'_app/immutable/chunks/C-hhfhAN.js',
	'_app/immutable/chunks/C9E6SjbS.js',
	'_app/immutable/chunks/PsFRGuNZ.js',
	'_app/immutable/chunks/-vmR0Fky.js',
	'_app/immutable/chunks/Bg__saH3.js'
];
export const stylesheets = ['_app/immutable/assets/Toggles.CycWLTk7.css'];
export const fonts = [];
