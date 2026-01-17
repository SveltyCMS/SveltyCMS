import { t as s } from './C-hhfhAN.js';
import { l as e } from './BvngfGKt.js';
function l(o, t = 'info', r = 3e3) {
	try {
		s.create({ title: t.charAt(0).toUpperCase() + t.slice(1), description: o, type: t, duration: r });
	} catch (a) {
		e.error('[toast] Failed to show toast:', a);
	}
}
export { l as s };
//# sourceMappingURL=BSPmpUse.js.map
