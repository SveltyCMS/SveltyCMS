import { i as A } from './zi73tRJP.js';
import { p as Z, z as G, g as e, d as L, b as l, c, s as w, r as m, t as b, a as H } from './DrlZFkx8.js';
import { f as k, a as g, s as z, d as K } from './CTjXDULS.js';
import { r as Y, c as j, a as v } from './MEFvoR_D.js';
import { b as $ } from './D4QnGYgQ.js';
import { p as ee } from './DePHBZW_.js';
import { l as te } from './BvngfGKt.js';
import { d as ae } from './D3eWcrZU.js';
var le = k('<p class="error-message svelte-n7lyz7" role="alert"> </p>'),
	re = k('<p class="svelte-n7lyz7"> </p>'),
	ie = k('<p class="svelte-n7lyz7"> </p>'),
	oe = k(
		'<div class="video-preview svelte-n7lyz7"><img class="thumbnail svelte-n7lyz7"/> <div class="details svelte-n7lyz7"><h3 class="svelte-n7lyz7"> </h3> <!> <!> <a target="_blank" rel="noopener noreferrer" class="watch-link svelte-n7lyz7"> </a></div></div>'
	),
	se = k('<div><label class="label">Video URL</label> <input type="url"/> <!> <!></div>');
function _e(E, t) {
	Z(t, !0);
	let u = ee(t, 'value', 7),
		p = L(''),
		r = L(null),
		y = L(!1),
		n = L(null);
	G(() => {
		u()?.url && u().url !== e(p) ? (l(p, u().url, !0), l(r, u(), !0)) : u() || (l(p, ''), l(r, null));
	});
	const M = {
		youtube: /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
		vimeo: /^https?:\/\/(www\.)?vimeo\.com\/\d+$/,
		twitch: /^https?:\/\/(www\.)?twitch\.tv\/videos\/\d+$/,
		tiktok: /^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+$/
	};
	function S(i) {
		const a = t.field.allowedPlatforms || ['youtube', 'vimeo', 'twitch', 'tiktok'],
			d = Array.isArray(a) ? a : typeof a == 'string' ? a.split(',').map((o) => o.trim()) : [];
		return d.some((o) => M[o]?.test(i)) ? { valid: !0 } : { valid: !1, error: `Invalid or disallowed video URL. Allowed platforms: ${d.join(', ')}` };
	}
	const W = ae.create((...i) => {
		const a = typeof i[0] == 'string' ? i[0] : '';
		if ((l(y, !0), l(n, null), l(r, null), !a)) {
			l(y, !1);
			return;
		}
		const d = S(a);
		if (!d.valid) {
			(l(n, d.error || 'Invalid video URL', !0), l(y, !1), u(null));
			return;
		}
		(async () => {
			try {
				const f = await fetch('/api/remoteVideo', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ url: a, allowedPlatforms: t.field.allowedPlatforms })
					}),
					o = await f.json();
				f.ok && o.success ? (l(r, o.data, !0), u(o.data)) : (l(n, o.error || 'Failed to fetch video metadata.', !0), u(null));
			} catch (f) {
				(te.error('Error fetching video metadata:', f), l(n, 'An unexpected error occurred while fetching video data.'), u(null));
			} finally {
				l(y, !1);
			}
		})();
	}, 500);
	function q() {
		W(e(p));
	}
	var x = se();
	let U;
	var V = c(x),
		s = w(V, 2);
	(Y(s), (s.__input = q));
	let I;
	var T = w(s, 2);
	{
		var D = (i) => {
			var a = le(),
				d = c(a, !0);
			(m(a),
				b(() => {
					(v(a, 'id', `${t.field.db_fieldName}-error`), z(d, t.error || e(n)));
				}),
				g(i, a));
		};
		A(T, (i) => {
			(t.error || e(n)) && i(D);
		});
	}
	var F = w(T, 2);
	{
		var Q = (i) => {
			var a = oe(),
				d = c(a),
				f = w(d, 2),
				o = c(f),
				B = c(o, !0);
			m(o);
			var O = w(o, 2);
			{
				var C = (h) => {
					var _ = re(),
						N = c(_);
					(m(_), b(() => z(N, `By: ${e(r).channelTitle ?? ''}`)), g(h, _));
				};
				A(O, (h) => {
					e(r).channelTitle && h(C);
				});
			}
			var R = w(O, 2);
			{
				var J = (h) => {
					var _ = ie(),
						N = c(_);
					(m(_), b(() => z(N, `Duration: ${e(r).duration ?? ''}`)), g(h, _));
				};
				A(R, (h) => {
					e(r).duration && h(J);
				});
			}
			var P = w(R, 2),
				X = c(P);
			(m(P),
				m(f),
				m(a),
				b(() => {
					(v(d, 'src', e(r).thumbnailUrl),
						v(d, 'alt', e(r).title),
						z(B, e(r).title),
						v(P, 'href', e(r).url),
						z(X, `Watch on ${e(r).platform ?? ''}`));
				}),
				g(i, a));
		};
		A(F, (i) => {
			e(r) && !e(y) && !e(n) && i(Q);
		});
	}
	(m(x),
		b(() => {
			((U = j(x, 1, 'input-container svelte-n7lyz7', null, U, { invalid: t.error || e(n) })),
				v(V, 'for', t.field.db_fieldName),
				v(s, 'id', t.field.db_fieldName),
				v(s, 'name', t.field.db_fieldName),
				(s.required = t.field.required),
				v(s, 'placeholder', typeof t.field.placeholder == 'string' ? t.field.placeholder : 'e.g., https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
				(I = j(s, 1, 'input svelte-n7lyz7', null, I, { loading: e(y) })),
				v(s, 'aria-invalid', !!t.error || !!e(n)),
				v(s, 'aria-describedby', t.error || e(n) ? `${t.field.db_fieldName}-error` : void 0));
		}),
		$(
			s,
			() => e(p),
			(i) => l(p, i)
		),
		g(E, x),
		H());
}
K(['input']);
export { _e as default };
//# sourceMappingURL=DMJunDHd.js.map
