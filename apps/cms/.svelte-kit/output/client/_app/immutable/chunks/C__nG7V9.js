import { i as k } from './zi73tRJP.js';
import { o as D } from './CMZtchEj.js';
import { p as F, f as L, a as I, b as c, d as V, s as f, c as m, g as s, r as v, n as P } from './DrlZFkx8.js';
import { c as B, a as b, f as x, e as K, d as M } from './CTjXDULS.js';
import { t as Y, f as z } from './0XeaN6pZ.js';
import { b as n, c as S } from './MEFvoR_D.js';
import { p as Z } from './DePHBZW_.js';
import { F as q } from './DE21BT69.js';
var G = x(
		'<form class="relative mt-2 flex flex-col items-center justify-center gap-4"><!> <button type="submit" class="preset-filled-primary-500 btn w-full">Add Video</button></form>'
	),
	H = x(
		'<div class="relative mt-2 flex flex-col items-center justify-center gap-4"><p class="text-sm text-gray-500">Video upload is not yet implemented.</p> <p>or</p> <div class="flex w-full justify-center gap-2"><button class="preset-outline-primary-500 btn w-full" disabled>Browse locally</button> <button class="variant-filled-secondary btn w-full">YouTube</button></div></div>'
	),
	J = x(
		'<div class="fixed inset-0 z-40 bg-black/30" role="presentation"></div> <div role="dialog" aria-modal="true" aria-labelledby="video-dialog-title" class="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 transform rounded-lg bg-white p-6 shadow-xl"><iconify-icon></iconify-icon> <h3 id="video-dialog-title" class="mb-4 text-lg font-medium">Add Video</h3> <!></div>',
		3
	);
function ae(E, u) {
	F(u, !0);
	let p = Z(u, 'show', 15, !1),
		y = V(!1),
		i = V('');
	function l() {
		(p(!1),
			setTimeout(() => {
				(c(i, ''), c(y, !1));
			}, 200));
	}
	function j(t) {
		t.preventDefault();
		const r = /^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})$/;
		s(i) && u.editor
			? r.test(s(i))
				? (u.editor
						.chain()
						.focus()
						.setYoutubeVideo({ src: s(i) })
						.run(),
					l())
				: alert('Invalid YouTube URL. Please use a valid youtube.com or youtu.be link.')
			: l();
	}
	D(() => {
		const t = (r) => {
			r.key === 'Escape' && p() && l();
		};
		return (
			window.addEventListener('keydown', t),
			() => {
				window.removeEventListener('keydown', t);
			}
		);
	});
	var h = B(),
		A = L(h);
	{
		var R = (t) => {
			var r = J(),
				_ = L(r);
			_.__click = l;
			var w = f(_, 2),
				e = m(w);
			(n(e, 'icon', 'material-symbols:close'),
				n(e, 'width', '24'),
				n(e, 'role', 'button'),
				n(e, 'aria-label', 'Close'),
				S(e, 1, 'absolute right-3 top-3 z-10 cursor-pointer text-gray-500 hover:text-gray-800'),
				(e.__click = l),
				(e.__keydown = (a) => a.key === 'Enter' && l()),
				n(e, 'tabindex', '0'));
			var T = f(e, 4);
			{
				var U = (a) => {
						var o = G(),
							d = m(o);
						(q(d, {
							autofocus: !0,
							textColor: 'black',
							name: 'Youtube URL',
							label: 'Youtube URL',
							get value() {
								return s(i);
							},
							set value(g) {
								c(i, g, !0);
							}
						}),
							P(2),
							v(o),
							K('submit', o, j),
							b(a, o));
					},
					C = (a) => {
						var o = H(),
							d = f(m(o), 4),
							g = f(m(d), 2);
						((g.__click = () => c(y, !0)), v(d), v(o), b(a, o));
					};
				k(T, (a) => {
					s(y) ? a(U) : a(C, !1);
				});
			}
			(v(w),
				Y(
					3,
					_,
					() => z,
					() => ({ duration: 150 })
				),
				Y(
					3,
					w,
					() => z,
					() => ({ duration: 150 })
				),
				b(t, r));
		};
		k(A, (t) => {
			p() && t(R);
		});
	}
	(b(E, h), I());
}
M(['click', 'keydown']);
export { ae as default };
//# sourceMappingURL=C__nG7V9.js.map
