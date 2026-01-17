import { i as g } from './zi73tRJP.js';
import { p as T, z as U, g as i, u as c, c as a, s as e, r as t, n as j, t as B, a as F } from './DrlZFkx8.js';
import { f as k, s as b, a as u } from './CTjXDULS.js';
import { p as P } from './DePHBZW_.js';
import { l as S } from './BvngfGKt.js';
var V = k(
		'<div class="mt-4 rounded border border-error-300 bg-error-50 p-2 text-xs text-error-700 dark:border-error-700 dark:bg-error-950 dark:text-error-300"><strong>Note:</strong> This field will not be editable until the widget is available.</div>'
	),
	q = k(
		'<div class="missing-widget rounded-lg border-2 border-warning-400 bg-warning-50 p-4 dark:border-warning-600 dark:bg-warning-950 svelte-xg5zfl" role="alert" aria-live="polite"><div class="mb-2 flex items-start gap-3"><svg class="h-6 w-6 shrink-0 text-warning-600 dark:text-warning-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> <div class="flex-1"><h3 class="text-lg font-semibold text-warning-800 dark:text-warning-200">Missing Widget</h3> <p class="mt-1 text-sm text-warning-700 dark:text-warning-300">The widget <strong> </strong> is not available for the field <strong> </strong>.</p></div></div> <!> <div class="mt-4 space-y-2"><p class="text-sm font-semibold text-warning-800 dark:text-warning-200">Possible Solutions:</p> <ul class="ml-4 space-y-1 text-sm text-warning-700 dark:text-warning-300"><li class="flex items-start gap-2"><span class="mt-0.5">•</span> <span>Check if the widget is installed and activated in <a href="/config/widgetManagement" class="underline hover:text-warning-900 dark:hover:text-warning-100">Widget Management</a></span></li> <li class="flex items-start gap-2"><span class="mt-0.5">•</span> <span>Verify the widget name matches an available widget</span></li> <li class="flex items-start gap-2"><span class="mt-0.5">•</span> <span>Check the collection schema configuration for typos</span></li> <!></ul></div> <!></div>'
	);
function K(_, r) {
	T(r, !0);
	const M = P(r, 'showDebugInfo', 19, () => !1),
		f = c(() => r.config.widget?.Name || r.config.__missingWidgetName || 'Unknown'),
		m = c(() => r.config.label || 'Unnamed Field'),
		N = c(() => r.config.db_fieldName || 'unknown_field');
	U(() => {
		S.warn(`[MissingWidget] Widget "${i(f)}" is missing for field "${i(m)}" (${i(N)})`);
	});
	const W = !1;
	var n = q(),
		o = a(n),
		v = e(a(o), 2),
		p = e(a(v), 2),
		l = e(a(p)),
		y = a(l);
	t(l);
	var w = e(l, 2),
		z = a(w);
	(t(w), j(), t(p), t(v), t(o));
	var x = e(o, 2);
	g(x, (s) => {
		M();
	});
	var d = e(x, 2),
		h = e(a(d), 2),
		C = e(a(h), 6);
	(g(C, (s) => {}), t(h), t(d));
	var D = e(d, 2);
	{
		var L = (s) => {
			var I = V();
			u(s, I);
		};
		g(D, (s) => {
			s(L);
		});
	}
	(t(n),
		B(() => {
			(b(y, `"${i(f) ?? ''}"`), b(z, `"${i(m) ?? ''}"`));
		}),
		u(_, n),
		F());
}
export { K as default };
//# sourceMappingURL=Cg1WN6mS.js.map
