import { i as _ } from './zi73tRJP.js';
import { p as N, f as Z, a as U, s as v, c as m, r as d, t as x, d as q, x as G, z as A, b as u, g as s } from './DrlZFkx8.js';
import { c as H, a as c, f, d as B, s as T, e as J } from './CTjXDULS.js';
import { e as K } from './BXe5mj2j.js';
import { b as Q } from './0XeaN6pZ.js';
import { a as $ } from './BEiD40NV.js';
import { c as j, a as C } from './MEFvoR_D.js';
import { p as ee } from './DePHBZW_.js';
import { l as D } from './BvngfGKt.js';
import { d as te } from './BH6PMYIi.js';
import { f as re } from './TC87idKr.js';
import { modalState as L } from './GeUt2_20.js';
var ae = f(
	'<div class="modal-media-library card p-4 w-modal shadow-xl space-y-4 bg-white dark:bg-surface-800"><header class="text-center text-primary-500 text-2xl font-bold">Media Library Modal Test</header> <article class="text-center text-sm">This is a simple test modal. If you can see this, the modal system is working!</article> <footer><button type="button">Close</button></footer></div>'
);
function oe(y, o) {
	N(o, !0);
	function w() {
		(console.log('[MediaLibraryModal] Closing modal'), L.close());
	}
	var g = H(),
		I = Z(g);
	{
		var M = (l) => {
			var r = ae(),
				p = v(m(r), 4),
				b = m(p);
			((b.__click = w),
				d(p),
				d(r),
				x(() => {
					(j(p, 1, `modal-footer flex justify-end gap-2 ${o.parent.regionFooter ?? ''}`), j(b, 1, `btn ${o.parent.buttonNeutral ?? ''}`));
				}),
				c(l, r));
		};
		_(I, (l) => {
			L.active && l(M);
		});
	}
	(c(y, g), U());
}
B(['click']);
var ie = f(
		'<div class="relative overflow-hidden rounded border border-surface-200 dark:text-surface-50"><img class="h-[100px] w-full object-cover"/> <span class="block truncate p-1 text-center text-xs"> </span> <button class="absolute right-1 top-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border-none bg-surface-900/50 text-white transition-colors hover:bg-surface-900/75" aria-label="Remove">×</button></div>'
	),
	se = f('<div class="mb-4 grid gap-4 [grid-cols-[repeat(auto-fill,minmax(100px,1fr))]"></div>'),
	le = f(
		'<button type="button" class="w-full cursor-pointer rounded border-none bg-surface-100 p-3 transition-colors hover:bg-surface-200 dark:bg-surface-700 dark:hover:bg-surface-600">+ Add Media</button>'
	),
	ne = f('<p class="absolute -bottom-4 left-0 w-full text-center text-xs text-error-500" role="alert"> </p>'),
	de = f('<div><!> <!> <!></div>');
function we(y, o) {
	N(o, !0);
	const w = [
			'image/jpeg',
			'image/png',
			'image/gif',
			'image/webp',
			'image/svg+xml',
			'video/mp4',
			'video/webm',
			'video/ogg',
			'application/pdf',
			'audio/mpeg',
			'audio/wav'
		],
		g = 10 * 1024 * 1024,
		I = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp4', 'webm', 'ogg', 'pdf', 'mp3', 'wav'];
	function M(e) {
		if (!w.includes(e.type)) return { valid: !1, error: `Invalid file type: ${e.type}` };
		if (e.size > g) return { valid: !1, error: `File too large (max 10MB): ${(e.size / 1024 / 1024).toFixed(2)}MB` };
		const t = e.name.split('.').pop()?.toLowerCase();
		return !t || !I.includes(t)
			? { valid: !1, error: `Invalid file extension: ${t}` }
			: e.name.includes('..') || e.name.includes('/') || e.name.includes('\\')
				? { valid: !1, error: 'Invalid filename characters detected' }
				: { valid: !0 };
	}
	let l = ee(o, 'value', 15),
		r = q(G([]));
	async function p(e) {
		return (
			D.debug('Fetching data for IDs:', e),
			new Promise((t) =>
				setTimeout(() => {
					const a = e.map((i) => ({
						_id: i,
						name: `Image ${i.slice(0, 4)}.jpg`,
						type: 'image/jpeg',
						size: 12345,
						url: `https://picsum.photos/id/${parseInt(i.slice(0, 3), 10)}/1920/1080`,
						thumbnailUrl: `https://picsum.photos/id/${parseInt(i.slice(0, 3), 10)}/200/200`
					}));
					t(a);
				}, 300)
			)
		);
	}
	(A(() => {
		const e = Array.isArray(l()) ? l() : l() ? [l()] : [];
		e.length > 0
			? p(e).then((t) => {
					u(r, t, !0);
				})
			: u(r, [], !0);
	}),
		A(() => {
			const e = s(r).map((t) => t._id);
			o.field.multiupload ? l(e) : l(e[0] || null);
		}));
	function b() {
		L.trigger(oe, { multiSelect: o.field.multiupload || !1 }, (e) => {
			if (e) {
				const t = e.filter((a) => {
					const i = { name: a.name, type: a.type, size: a.size },
						n = M(i);
					return n.valid ? !0 : (D.warn(`[MediaUpload Security] Rejected file ${a.name}: ${n.error}`), !1);
				});
				o.field.multiupload ? u(r, [...s(r), ...t], !0) : t.length > 0 && u(r, [t[0]], !0);
			}
		});
	}
	function O(e) {
		u(
			r,
			s(r).filter((t) => t._id !== e),
			!0
		);
	}
	var h = de();
	let z;
	var E = m(h);
	{
		var P = (e) => {
			var t = se();
			(K(
				t,
				29,
				() => s(r),
				(a) => a._id,
				(a, i) => {
					var n = ie(),
						k = m(n),
						F = v(k, 2),
						W = m(F, !0);
					d(F);
					var Y = v(F, 2);
					((Y.__click = () => O(s(i)._id)),
						d(n),
						x(() => {
							(C(k, 'src', s(i).thumbnailUrl), C(k, 'alt', s(i).name), T(W, s(i).name));
						}),
						Q(n, () => re, null),
						c(a, n));
				}
			),
				d(t),
				$(
					t,
					(a, i) => te?.(a, i),
					() => ({ items: s(r) })
				),
				J('consider', t, (a) => u(r, a.detail.items, !0)),
				c(e, t));
		};
		_(E, (e) => {
			s(r).length > 0 && e(P);
		});
	}
	var S = v(E, 2);
	{
		var R = (e) => {
			var t = le();
			((t.__click = b), c(e, t));
		};
		_(S, (e) => {
			(o.field.multiupload || s(r).length === 0) && e(R);
		});
	}
	var X = v(S, 2);
	{
		var V = (e) => {
			var t = ne(),
				a = m(t, !0);
			(d(t), x(() => T(a, o.error)), c(e, t));
		};
		_(X, (e) => {
			o.error && e(V);
		});
	}
	(d(h),
		x(
			() =>
				(z = j(h, 1, 'min-h-[120px] rounded-lg border-2 border-dashed border-surface-300 p-4 dark:border-surface-600', null, z, {
					'!border-error-500': o.error
				}))
		),
		c(y, h),
		U());
}
B(['click']);
export { we as default };
//# sourceMappingURL=BLOqmTt6.js.map
