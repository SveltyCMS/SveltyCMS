const __vite__mapDeps = (i, m = __vite__mapDeps, d = m.f || (m.f = ['./ClfUjtKL.js', './DaWZu8wl.js'])) => i.map((i) => d[i]);
import { _ as L } from './PPVm8Dsz.js';
import { i as T } from './zi73tRJP.js';
import { o as O } from './CMZtchEj.js';
import { p as D, b as m, d as z, z as W, f as E, g as h, a as R, c as S, r as k, t as c } from './DrlZFkx8.js';
import { c as q, a as l, f as _ } from './CTjXDULS.js';
import { h as G } from './IGLJqrie.js';
import { c as u, d as A } from './MEFvoR_D.js';
import { p as P } from './DePHBZW_.js';
var w = _('<div data-sanitized=""><!></div>'),
	x = _('<div data-sanitize-loading=""></div>');
function B(d, r) {
	D(r, !0);
	let n = P(r, 'profile', 3, 'default'),
		i,
		s = z('');
	const p = {
		default: {
			ALLOWED_TAGS: [
				'p',
				'br',
				'strong',
				'em',
				'u',
				's',
				'a',
				'ul',
				'ol',
				'li',
				'blockquote',
				'code',
				'pre',
				'h1',
				'h2',
				'h3',
				'h4',
				'h5',
				'h6',
				'img',
				'span',
				'div'
			],
			ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel'],
			ALLOW_DATA_ATTR: !1
		},
		'rich-text': {
			ALLOWED_TAGS: [
				'p',
				'br',
				'strong',
				'em',
				'u',
				's',
				'a',
				'ul',
				'ol',
				'li',
				'blockquote',
				'code',
				'pre',
				'h1',
				'h2',
				'h3',
				'h4',
				'h5',
				'h6',
				'img',
				'span',
				'div',
				'table',
				'thead',
				'tbody',
				'tr',
				'th',
				'td',
				'hr',
				'sub',
				'sup',
				'mark',
				'abbr',
				'cite',
				'q',
				'del',
				'ins'
			],
			ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'target', 'rel', 'width', 'height', 'align', 'colspan', 'rowspan'],
			ALLOW_DATA_ATTR: !0
		},
		strict: { ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a'], ALLOWED_ATTR: ['href', 'title', 'rel'], ALLOW_DATA_ATTR: !1 }
	};
	O(async () => {
		((i = (await L(() => import('./ClfUjtKL.js').then((t) => t.b), __vite__mapDeps([0, 1]), import.meta.url)).default), o());
	});
	function o() {
		if (!i || !r.html) {
			m(s, '');
			return;
		}
		const a = p[n()];
		(i.addHook('afterSanitizeAttributes', (t) => {
			if (t.tagName === 'A' && t.hasAttribute('href')) {
				const e = t.getAttribute('href');
				(e && !e.match(/^(https?:|mailto:|\/|#)/) && !e.startsWith('data:') && t.removeAttribute('href'),
					e &&
						e.match(/^https?:/) &&
						(t.setAttribute('rel', 'noopener noreferrer'), t.getAttribute('target') !== '_blank' && t.removeAttribute('target')));
			}
			if (t.tagName === 'IMG' && t.hasAttribute('src')) {
				const e = t.getAttribute('src');
				e && !e.match(/^(https?:|data:|\/)/) && t.removeAttribute('src');
			}
		}),
			m(s, i.sanitize(r.html, a), !0));
	}
	W(() => {
		i && o();
	});
	var f = q(),
		b = E(f);
	{
		var v = (a) => {
				var t = w(),
					e = S(t);
				(G(e, () => h(s)), k(t), c(() => u(t, 1, A(r.class), 'svelte-u2dqrz')), l(a, t));
			},
			g = (a) => {
				var t = x();
				(c(() => u(t, 1, A(r.class), 'svelte-u2dqrz')), l(a, t));
			};
		T(b, (a) => {
			h(s) ? a(v) : a(g, !1);
		});
	}
	(l(d, f), R());
}
export { B as S };
//# sourceMappingURL=CWif1oam.js.map
