import { x as f, g as n, u as i } from './DrlZFkx8.js';
import { n as d } from './B_fImZOG.js';
import { l as s } from './BvngfGKt.js';
const t = f({
		currentTheme: null,
		isLoading: !1,
		error: null,
		lastUpdateAttempt: null,
		themePreference: 'unknown',
		resolvedDarkMode: !0,
		autoRefreshEnabled: !1
	}),
	g = i(() => t.currentTheme),
	k = i(() => t.themePreference),
	p = i(() => t.resolvedDarkMode),
	y = i(() => t.autoRefreshEnabled),
	E = {
		get currentTheme() {
			return n(g);
		},
		get themePreference() {
			return n(k);
		},
		get isDarkMode() {
			return n(p);
		},
		get autoRefreshEnabled() {
			return n(y);
		}
	};
let a = null;
const m = 'theme';
function T(e) {
	const r = window.matchMedia('(prefers-color-scheme: light)').matches;
	switch (e) {
		case 'dark':
			return !0;
		case 'light':
			return !1;
		case 'system':
		case 'unknown':
		default:
			return !r;
	}
}
function D() {
	const e = document.cookie
			.split('; ')
			.find((h) => h.startsWith(`${m}=`))
			?.split('=')[1],
		r = document.documentElement.classList.contains('dark');
	let o = 'system';
	(e === 'dark' || e === 'light' || e === 'system'
		? (o = e)
		: (e && console.warn('[Theme Init] Unknown cookie value, defaulting to system:', e), (o = 'system')),
		(t.themePreference = o),
		(t.resolvedDarkMode = r),
		e || (l(o), s.debug('[Theme Init] Set cookie to default dark mode:', o)),
		document.cookie.includes('darkMode=') &&
			((document.cookie = 'darkMode=; path=/; max-age=0'), s.debug('[Theme Init] Cleaned up old darkMode cookie')),
		u());
}
function c(e) {
	const r = document.documentElement;
	(e
		? (r.classList.add('dark'), r.classList.remove('light'), s.debug('[Theme] Applied dark/removed light from DOM'))
		: (r.classList.add('light'), r.classList.remove('dark'), s.debug('[Theme] Applied light/removed dark from DOM')),
		document.body.getAttribute('data-theme') !== 'sveltycms' && document.body.setAttribute('data-theme', 'sveltycms'));
}
function l(e) {
	((document.cookie = `${m}=${e}; path=/; max-age=31536000; SameSite=Lax`), s.debug('[Theme] Updated cookie to:', e));
}
function u() {
	const e = window.matchMedia('(prefers-color-scheme: dark)');
	(a && e.removeEventListener('change', a),
		(a = (r) => {
			t.themePreference === 'system' &&
				(s.debug('[Theme] System preference changed to:', r.matches ? 'dark' : 'light'), (t.resolvedDarkMode = r.matches), c(r.matches));
		}),
		e.addEventListener('change', a));
}
function w(e) {
	(e === 'unknown' && (console.warn('[Theme] Cannot set preference to "unknown", defaulting to "system"'), (e = 'system')),
		s.debug('[Theme] Setting preference to:', e),
		(t.themePreference = e),
		(t.resolvedDarkMode = T(e)),
		c(t.resolvedDarkMode),
		l(e),
		u());
}
function L() {
	w('system');
}
async function S() {
	((t.isLoading = !0), (t.error = null));
	try {
		const e = await fetch('/api/theme/default');
		if (!e.ok) throw new Error(`Failed to fetch theme: ${e.statusText}`);
		const r = await e.json();
		return ((t.currentTheme = r ?? null), (t.lastUpdateAttempt = d()), r);
	} catch (e) {
		throw ((t.error = e instanceof Error ? e.message : 'Failed to initialize theme'), e);
	} finally {
		t.isLoading = !1;
	}
}
async function P(e) {
	((t.isLoading = !0), (t.error = null));
	try {
		const r = await fetch('/api/theme/update-theme', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ themeName: e })
		});
		if (!r.ok) throw new Error(`Failed to update theme: ${r.statusText}`);
		const o = await r.json();
		return ((t.currentTheme = o), (t.lastUpdateAttempt = d()), o);
	} catch (r) {
		const o = r instanceof Error ? r.message : 'Failed to update theme';
		throw ((t.error = o), new Error(o));
	} finally {
		t.isLoading = !1;
	}
}
export { L as a, D as b, S as i, w as s, E as t, P as u };
//# sourceMappingURL=BpdyKTB3.js.map
