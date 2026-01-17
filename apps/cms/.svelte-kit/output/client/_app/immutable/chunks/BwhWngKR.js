import { i as g } from './zi73tRJP.js';
import { p as ae, c as o, n as m, r as a, s, b as re, g as t, d as oe, t as p, u as P, a as ce } from './DrlZFkx8.js';
import { f as v, a as l, s as D, d as ne } from './CTjXDULS.js';
import { e as se, i as le } from './BXe5mj2j.js';
import { b as f, c as x, a as q } from './MEFvoR_D.js';
import { p as d } from './DePHBZW_.js';
var de = v('<button type="button"><iconify-icon></iconify-icon></button>', 2),
	ve = v('<img alt="Social Preview" class="w-full h-full object-cover"/>'),
	fe = v(
		'<div class="flex flex-col items-center text-gray-400"><iconify-icon></iconify-icon> <span class="text-xs uppercase font-bold mt-2 tracking-wider">No Image</span></div>',
		2
	),
	me = v(
		'<div class="flex items-center gap-2 text-warning-600"><iconify-icon></iconify-icon> <span>Title is slightly long for Facebook (recommended &lt; 95 chars).</span></div>',
		2
	),
	ge = v(
		'<div class="flex items-center gap-2 text-warning-600"><iconify-icon></iconify-icon> <span>Title is too long for X cards (recommended &lt; 70 chars).</span></div>',
		2
	),
	pe = v(
		'<div class="flex items-center gap-2 text-warning-600 mt-1"><iconify-icon></iconify-icon> <span>No Og Image selected. The platform will try to scrape one from your page body.</span></div>',
		2
	),
	xe = v(
		'<div class="card preset-tonal-surface p-4 rounded-container-token mb-6"><div class="flex items-center gap-2 mb-4"><iconify-icon></iconify-icon> <h3 class="h3">Social Share Preview</h3></div> <div class="flex items-center gap-2 mb-6 overflow-x-auto pb-2"></div> <div class="bg-surface-50 dark:bg-surface-900 rounded-lg p-4 md:p-8 flex justify-center border border-surface-200 dark:text-surface-50"><div class="w-full max-w-[500px] bg-white text-black overflow-hidden shadow-lg rounded-lg transition-all duration-300"><div class="relative bg-gray-100 aspect-[1.91/1] flex items-center justify-center overflow-hidden"><!></div> <div class="p-3 bg-[#f0f2f5] border-t border-gray-200"><div class="text-[12px] uppercase text-gray-500 truncate font-sans mb-0.5"> </div> <div class="font-bold text-[16px] leading-snug text-[#050505] line-clamp-2 md:line-clamp-1 font-sans mb-1"> </div> <div class="text-[14px] text-[#65676b] line-clamp-1 md:line-clamp-2 font-sans"> </div></div></div></div> <div class="mt-4 text-sm text-surface-600 dark:text-surface-300"><!> <!> <!></div></div>',
		2
	);
function ke(z, c) {
	ae(c, !0);
	let S = d(c, 'ogTitle', 3, ''),
		j = d(c, 'ogDescription', 3, ''),
		B = d(c, 'ogImage', 3, ''),
		E = d(c, 'twitterTitle', 3, ''),
		G = d(c, 'twitterDescription', 3, ''),
		U = d(c, 'twitterImage', 3, ''),
		H = d(c, 'hostUrl', 3, ''),
		n = oe('facebook'),
		b = P(() => (t(n) === 'twitter' ? E() || S() || 'Page Title' : S() || 'Page Title')),
		J = P(() => (t(n) === 'twitter' ? G() || j() || 'Page description...' : j() || 'Page description...')),
		_ = P(() => (t(n) === 'twitter' && U() ? U() : B()));
	const K = [
		{ id: 'facebook', icon: 'mdi:facebook', color: 'text-blue-600', label: 'Facebook' },
		{ id: 'whatsapp', icon: 'mdi:whatsapp', color: 'text-green-500', label: 'WhatsApp' },
		{ id: 'twitter', icon: 'mdi:twitter', color: 'text-black dark:text-white', label: 'X (Twitter)' },
		{ id: 'linkedin', icon: 'mdi:linkedin', color: 'text-blue-700', label: 'LinkedIn' },
		{ id: 'discord', icon: 'ic:baseline-discord', color: 'text-indigo-500', label: 'Discord' }
	];
	var u = xe(),
		w = o(u),
		F = o(w);
	(f(F, 'icon', 'mdi:share-variant'), x(F, 1, 'text-secondary-500 text-xl'), m(2), a(w));
	var y = s(w, 2);
	(se(
		y,
		21,
		() => K,
		le,
		(i, e) => {
			var r = de();
			r.__click = () => re(n, t(e).id, !0);
			var W = o(r);
			(p(() => f(W, 'icon', t(e).icon)),
				a(r),
				p(() => {
					(x(
						r,
						1,
						`btn btn-icon btn-icon-sm transition-all ${t(n) === t(e).id ? 'variant-filled-secondary ring-2 ring-surface-900 dark:ring-white scale-110' : 'preset-tonal-surface hover:preset-filled-surface-500'}`
					),
						q(r, 'title', t(e).label),
						x(W, 1, `text-xl ${(t(n) === t(e).id ? 'text-white' : t(e).color) ?? ''}`));
				}),
				l(i, r));
		}
	),
		a(y));
	var h = s(y, 2),
		N = o(h),
		k = o(N),
		M = o(k);
	{
		var Q = (i) => {
				var e = ve();
				(p(() => q(e, 'src', t(_))), l(i, e));
			},
			R = (i) => {
				var e = fe(),
					r = o(e);
				(f(r, 'icon', 'mdi:image-off'), x(r, 1, 'text-4xl'), m(2), a(e), l(i, e));
			};
		g(M, (i) => {
			t(_) ? i(Q) : i(R, !1);
		});
	}
	a(k);
	var X = s(k, 2),
		T = o(X),
		V = o(T, !0);
	a(T);
	var I = s(T, 2),
		Y = o(I, !0);
	a(I);
	var A = s(I, 2),
		Z = o(A, !0);
	(a(A), a(X), a(N), a(h));
	var C = s(h, 2),
		L = o(C);
	{
		var $ = (i) => {
			var e = me(),
				r = o(e);
			(f(r, 'icon', 'mdi:alert'), m(2), a(e), l(i, e));
		};
		g(L, (i) => {
			t(b).length > 95 && t(n) === 'facebook' && i($);
		});
	}
	var O = s(L, 2);
	{
		var ee = (i) => {
			var e = ge(),
				r = o(e);
			(f(r, 'icon', 'mdi:alert'), m(2), a(e), l(i, e));
		};
		g(O, (i) => {
			t(b).length > 70 && t(n) === 'twitter' && i(ee);
		});
	}
	var ie = s(O, 2);
	{
		var te = (i) => {
			var e = pe(),
				r = o(e);
			(f(r, 'icon', 'mdi:image-search'), m(2), a(e), l(i, e));
		};
		g(ie, (i) => {
			t(_) || i(te);
		});
	}
	(a(C),
		a(u),
		p(
			(i) => {
				(D(V, i), D(Y, t(b)), D(Z, t(J)));
			},
			[
				() =>
					H()
						.replace(/^https?:\/\//, '')
						.split('/')[0]
						.toUpperCase()
			]
		),
		l(z, u),
		ce());
}
ne(['click']);
export { ke as default };
//# sourceMappingURL=BwhWngKR.js.map
