import { i as I } from './zi73tRJP.js';
import { o as Ae } from './CMZtchEj.js';
import {
	p as Ke,
	d as X,
	x as ze,
	g as r,
	u as c,
	b as z,
	z as Me,
	c as y,
	r as v,
	s as h,
	t as ee,
	a as We,
	f as N,
	ag as Oe,
	n as He
} from './DrlZFkx8.js';
import { f as W, a as x, c as fe, d as Re, s as be } from './CTjXDULS.js';
import { t as Ie, s as Ve } from './0XeaN6pZ.js';
import { a as Ee } from './BEiD40NV.js';
import { c as pe, b as O, a as Ne, h as Ge } from './MEFvoR_D.js';
import { p as Fe } from './DePHBZW_.js';
import { a as Ye } from './C-hhfhAN.js';
import { p as te } from './C9E6SjbS.js';
import { t as Be } from './CE8QOwyb.js';
import qe from './C1XjBKGT.js';
import je from './CIfv4OHC.js';
import $e from './BwhWngKR.js';
import M from './ByrvDoqP.js';
class Je {
	config;
	stopWords;
	transitionWords;
	removeScriptTags(e) {
		let t;
		do ((t = e), (e = e.replace(/<script[\s\S]*?>[\s\S]*?<\/script\s*>/gi, '')), (e = e.replace(/<script[^>]*>/gi, '')));
		while (e !== t);
		return e;
	}
	constructor(e) {
		((this.config = e),
			(this.stopWords = new Set([
				'a',
				'an',
				'and',
				'are',
				'as',
				'at',
				'be',
				'by',
				'for',
				'from',
				'has',
				'he',
				'in',
				'is',
				'it',
				'its',
				'of',
				'on',
				'that',
				'the',
				'to',
				'was',
				'will',
				'with',
				'would',
				'could',
				'should',
				'may',
				'might',
				'can',
				'shall',
				'must',
				'ought',
				'need',
				'dare'
			])),
			(this.transitionWords = new Set([
				'however',
				'therefore',
				'furthermore',
				'moreover',
				'additionally',
				'consequently',
				'meanwhile',
				'nevertheless',
				'nonetheless',
				'alternatively',
				'similarly',
				'likewise',
				'conversely',
				'in contrast',
				'on the other hand',
				'in addition',
				'as a result',
				'for example',
				'for instance',
				'in particular',
				'specifically',
				'namely',
				'that is',
				'in other words',
				'to clarify',
				'to summarize',
				'in conclusion',
				'finally',
				'ultimately',
				'overall'
			])));
	}
	async analyze(e, t, i, a) {
		const n = performance.now(),
			[s, d, p, o] = await Promise.all([
				this.analyzeKeywords(e, t, i),
				this.analyzeReadability(i),
				this.analyzeContentStructure(i),
				this.analyzeTechnical(e, t, a)
			]),
			k = this.calculateOverallScore(s, d, p, o),
			m = this.generateSuggestions(s, d, p, o),
			f = performance.now() - n;
		return {
			score: k,
			keywords: s,
			readability: d,
			contentStructure: p,
			technical: o,
			social: {
				facebook: { title: e.substring(0, 60), description: t.substring(0, 155), image: '', type: 'article' },
				twitter: { title: e.substring(0, 70), description: t.substring(0, 200), image: '', card: 'summary_large_image' },
				linkedin: { title: e.substring(0, 60), description: t.substring(0, 155), image: '' }
			},
			suggestions: m,
			serpPreview: { title: e.substring(0, 60), description: t.substring(0, 160), url: a || '', breadcrumbs: this.extractBreadcrumbs(a) },
			lastAnalyzed: new Date(),
			analysisTime: f
		};
	}
	async analyzeKeywords(e, t, i) {
		if (!this.config.focusKeyword) return [];
		const a = this.config.focusKeyword.toLowerCase(),
			n = this.tokenize(i.toLowerCase()),
			s = n.length,
			d = n.filter((T) => T === a).length,
			p = (d / s) * 100,
			o = n.indexOf(a),
			k = o !== -1 ? (o / s) * 100 : -1,
			m = e.toLowerCase().includes(a),
			f = t.toLowerCase().includes(a),
			u = Math.floor(s / 3),
			w = n.slice(0, u).filter((T) => T === a).length,
			G = n.slice(u, u * 2).filter((T) => T === a).length,
			F = n.slice(u * 2).filter((T) => T === a).length;
		return [
			{
				focusKeyword: a,
				density: p,
				prominence: this.calculateKeywordProminence(m, f, k),
				firstOccurrence: k,
				inTitle: m,
				inDescription: f,
				inUrl: !1,
				inHeadings: this.findKeywordInHeadings(i, a),
				variations: this.findKeywordVariations(i, a),
				distribution: { beginning: (w / d) * 100 || 0, middle: (G / d) * 100 || 0, end: (F / d) * 100 || 0 }
			}
		];
	}
	analyzeReadability(e) {
		const t = this.splitIntoSentences(e),
			i = this.tokenize(e),
			a = this.countSyllables(e),
			n = i.length / t.length,
			s = a / i.length,
			d = 206.835 - 1.015 * n - 84.6 * s,
			p = this.detectPassiveVoice(t),
			o = (p.length / t.length) * 100,
			k = t.filter((u) => this.tokenize(u).length > 20).length,
			m = this.countTransitionWords(e),
			f = Math.ceil(i.length / 200);
		return {
			fleschKincaidScore: d,
			readingLevel: this.getReadingLevel(d),
			averageSentenceLength: n,
			averageWordsPerSentence: n,
			passiveVoicePercentage: o,
			sentencesWithPassiveVoice: p.length,
			complexSentences: k,
			transitionWords: m,
			readingTime: f,
			wordCount: i.length,
			sentenceCount: t.length,
			paragraphCount: e
				.split(
					`

`
				)
				.filter((u) => u.trim().length > 0).length
		};
	}
	analyzeContentStructure(e) {
		const t = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi,
			i = { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] };
		let a;
		for (; (a = t.exec(e)) !== null; ) {
			const w = parseInt(a[1]),
				G = this.removeScriptTags(a[2])
					.replace(/<[^>]*>/g, '')
					.trim();
			i[`h${w}`].push(G);
		}
		const n = i.h1.length > 0,
			s = i.h1.length > 1,
			d = this.checkHeadingHierarchy(i),
			p = (e.match(/<(?:ul|ol)>/gi) || []).length,
			o = (e.match(/<img[^>]*>/gi) || []).length,
			k = (e.match(/<img(?![^>]*alt=)[^>]*>/gi) || []).length,
			m = (e.match(/<a[^>]*href=["'][^"']*(?:localhost|your-domain)[^"']*["'][^>]*>/gi) || []).length,
			f = (e.match(/<a[^>]*href=["'](?:https?:\/\/)[^"']*["'][^>]*>/gi) || []).length - m,
			u = (e.match(/<a[^>]*rel=["'][^"']*nofollow[^"']*["'][^>]*>/gi) || []).length;
		return {
			headings: i,
			hasH1: n,
			multipleH1: s,
			headingHierarchy: d,
			listCount: p,
			imageCount: o,
			imagesWithoutAlt: k,
			linkCount: { internal: m, external: f, nofollow: u }
		};
	}
	analyzeTechnical(e, t, i) {
		return {
			titleLength: e.length,
			descriptionLength: t.length,
			urlStructure: i
				? {
						length: i.length,
						hasKeyword: this.config.focusKeyword ? i.toLowerCase().includes(this.config.focusKeyword.toLowerCase()) : !1,
						isReadable: this.isUrlReadable(i),
						hasStopWords: this.urlHasStopWords(i)
					}
				: { length: 0, hasKeyword: !1, isReadable: !0, hasStopWords: !1 },
			metaRobots: 'index, follow',
			schemaMarkup: [],
			sitemap: !1,
			robotsTxt: !1
		};
	}
	calculateOverallScore(e, t, i, a) {
		if (t.wordCount === 0 && a.titleLength === 0 && a.descriptionLength === 0)
			return { overall: 0, content: 0, technical: 0, readability: 0, keywords: 0, social: 0 };
		let n = 50;
		(a.titleLength > 0 && (n += 10),
			i.multipleH1 || (n += 5),
			i.headingHierarchy && (n += 10),
			t.wordCount >= 300 && (n += 15),
			t.wordCount >= 1e3 && (n += 10));
		let s = 50;
		(a.titleLength >= 30 && a.titleLength <= 60 && (s += 20),
			a.descriptionLength >= 120 && a.descriptionLength <= 160 && (s += 20),
			a.urlStructure.isReadable && (s += 10));
		const d = Math.max(0, Math.min(100, (t.fleschKincaidScore / 100) * 100));
		let p = 50;
		if (e.length > 0) {
			const m = e[0];
			(m.inTitle && (p += 15), m.inDescription && (p += 15), m.density >= 0.5 && m.density <= 2.5 && (p += 20));
		}
		const o = 75;
		return { overall: Math.round((n + s + d + p + o) / 5), content: n, technical: s, readability: d, keywords: p, social: o };
	}
	generateSuggestions(e, t, i, a) {
		const n = [];
		if (
			(a.titleLength < 30 &&
				n.push({
					id: 'title-too-short',
					type: 'warning',
					category: 'technical',
					title: 'Title is too short',
					description: 'Your title is shorter than 30 characters. Consider adding more descriptive text.',
					impact: 'high',
					effort: 'easy',
					priority: 90,
					actionable: !0,
					fix: 'Add more descriptive keywords to your title to reach 30-60 characters.'
				}),
			a.titleLength > 60 &&
				n.push({
					id: 'title-too-long',
					type: 'error',
					category: 'technical',
					title: 'Title is too long',
					description: 'Your title exceeds 60 characters and may be truncated in search results.',
					impact: 'high',
					effort: 'easy',
					priority: 95,
					actionable: !0,
					fix: 'Shorten your title to 30-60 characters for optimal display.'
				}),
			a.descriptionLength < 120 &&
				n.push({
					id: 'description-too-short',
					type: 'warning',
					category: 'technical',
					title: 'Meta description is too short',
					description: 'Your meta description is shorter than 120 characters.',
					impact: 'medium',
					effort: 'easy',
					priority: 70,
					actionable: !0,
					fix: 'Expand your meta description to 120-160 characters.'
				}),
			i.multipleH1 &&
				n.push({
					id: 'multiple-h1',
					type: 'warning',
					category: 'content',
					title: 'Multiple H1 headings',
					description: 'Your content has multiple H1 headings. Use only one H1 per page.',
					impact: 'medium',
					effort: 'easy',
					priority: 60,
					actionable: !0,
					fix: 'Use only one H1 heading and convert others to H2 or H3.'
				}),
			t.passiveVoicePercentage > 10 &&
				n.push({
					id: 'passive-voice',
					type: 'warning',
					category: 'readability',
					title: 'Too much passive voice',
					description: `${t.passiveVoicePercentage.toFixed(1)}% of your sentences use passive voice.`,
					impact: 'medium',
					effort: 'medium',
					priority: 50,
					actionable: !0,
					fix: 'Convert passive voice sentences to active voice for better readability.'
				}),
			t.averageWordsPerSentence > 20 &&
				n.push({
					id: 'long-sentences',
					type: 'warning',
					category: 'readability',
					title: 'Sentences are too long',
					description: 'Your average sentence length is high, which may affect readability.',
					impact: 'medium',
					effort: 'medium',
					priority: 45,
					actionable: !0,
					fix: 'Break long sentences into shorter ones for better readability.'
				}),
			e.length > 0)
		) {
			const s = e[0];
			(s.inTitle ||
				n.push({
					id: 'keyword-not-in-title',
					type: 'warning',
					category: 'keywords',
					title: 'Focus keyword not in title',
					description: 'Your focus keyword does not appear in the title.',
					impact: 'high',
					effort: 'easy',
					priority: 80,
					actionable: !0,
					fix: `Include "${s.focusKeyword}" in your title.`
				}),
				s.density < 0.5 &&
					n.push({
						id: 'keyword-density-low',
						type: 'info',
						category: 'keywords',
						title: 'Low keyword density',
						description: 'Your keyword density is quite low.',
						impact: 'low',
						effort: 'easy',
						priority: 30,
						actionable: !0,
						fix: `Use "${s.focusKeyword}" more frequently in your content.`
					}),
				s.density > 2.5 &&
					n.push({
						id: 'keyword-density-high',
						type: 'warning',
						category: 'keywords',
						title: 'High keyword density',
						description: 'Your keyword density might be too high and could be seen as keyword stuffing.',
						impact: 'medium',
						effort: 'easy',
						priority: 65,
						actionable: !0,
						fix: `Reduce the frequency of "${s.focusKeyword}" in your content.`
					}));
		}
		return n.sort((s, d) => d.priority - s.priority);
	}
	tokenize(e) {
		return e.toLowerCase().match(/\b\w+\b/g) || [];
	}
	splitIntoSentences(e) {
		return e.split(/[.!?]+/).filter((t) => t.trim().length > 0);
	}
	countSyllables(e) {
		return this.tokenize(e).reduce((i, a) => i + this.countSyllablesInWord(a), 0);
	}
	countSyllablesInWord(e) {
		if (((e = e.toLowerCase()), e.length <= 3)) return 1;
		const t = 'aeiouy';
		let i = 0,
			a = !1;
		for (let n = 0; n < e.length; n++) {
			const s = t.includes(e[n]);
			(s && !a && i++, (a = s));
		}
		return (e.endsWith('e') && i--, Math.max(1, i));
	}
	detectPassiveVoice(e) {
		const t = [
			'was',
			'were',
			'been',
			'being',
			'is',
			'are',
			'am',
			'was being',
			'were being',
			'has been',
			'have been',
			'had been',
			'will be',
			'will have been'
		];
		return e.filter((i) => {
			const a = this.tokenize(i);
			return t.some((n) => i.toLowerCase().includes(n)) && a.some((n) => n.endsWith('ed') || n.endsWith('en'));
		});
	}
	countTransitionWords(e) {
		return this.tokenize(e).filter((i) => this.transitionWords.has(i)).length;
	}
	getReadingLevel(e) {
		return e >= 90 ? 'elementary' : e >= 80 ? 'middle-school' : e >= 70 ? 'high-school' : e >= 60 ? 'college' : 'graduate';
	}
	calculateKeywordProminence(e, t, i) {
		let a = 0;
		return (e && (a += 40), t && (a += 30), i >= 0 && i < 10 && (a += 30), a);
	}
	findKeywordInHeadings(e, t) {
		const i = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi,
			a = [];
		let n;
		for (; (n = i.exec(e)) !== null; )
			n[1]
				.replace(/<[^>]*>/g, '')
				.toLowerCase()
				.includes(t) && a.push(n[0]);
		return a;
	}
	findKeywordVariations(e, t) {
		const i = this.tokenize(e),
			a = new Set();
		return (
			i.forEach((n) => {
				(n.includes(t) || t.includes(n)) && n !== t && n.length > 3 && a.add(n);
			}),
			Array.from(a).slice(0, 5)
		);
	}
	checkHeadingHierarchy(e) {
		let t = 0;
		const i = Object.keys(e);
		for (const a of i) {
			const n = parseInt(a.charAt(1));
			if (e[a].length > 0) {
				if (n > t + 1) return !1;
				t = n;
			}
		}
		return !0;
	}
	isUrlReadable(e) {
		const t = e.split('/').pop() || '',
			i = (t.match(/[a-zA-Z]+/g) || []).length,
			a = t.length;
		return i > 0 && (i * 4) / a > 0.5;
	}
	urlHasStopWords(e) {
		const t = e.toLowerCase();
		return Array.from(this.stopWords).some((i) => t.includes(i));
	}
	extractBreadcrumbs(e) {
		return e
			? e
					.replace(/^https?:\/\/[^/]+/, '')
					.split('/')
					.filter((a) => a.length > 0)
					.map((a) => a.replace(/-/g, ' ').replace(/\b\w/g, (n) => n.toUpperCase()))
			: void 0;
	}
}
async function Ze(H, e) {
	const t = {
		focusKeyword: H.focusKeyword || '',
		locale: 'en',
		contentLanguage: 'en',
		targetAudience: 'general',
		contentType: 'article',
		enableRealTimeAnalysis: !1,
		analysisDepth: 'basic',
		enabledFeatures: { basic: !0, advanced: !0, social: !0, schema: !0, ai: !1, readability: !0, keywords: !0, preview: !0 }
	};
	return await new Je(t).analyze(H.title || '', H.description || '', e, H.canonicalUrl || '');
}
var Qe = W('<button>Social</button>'),
	Xe = W('<button>Advanced</button>'),
	et = W('<!> <!> <!>', 1),
	tt = W(
		'<div class="grid grid-cols-1 lg:grid-cols-2 gap-6"><div class="space-y-4"><h3 class="h3 font-bold">Open Graph (Facebook/LinkedIn)</h3> <!> <!></div> <div class="space-y-4"><h3 class="h3 font-bold">Twitter Card</h3> <!> <!></div></div> <div class="mt-6 pt-4 border-t border-surface-500/30"><!></div>',
		1
	),
	rt = W('<iconify-icon></iconify-icon>', 2),
	it = W('<iconify-icon></iconify-icon>', 2),
	at = W(
		'<div class="flex items-center gap-1 text-xs"><iconify-icon></iconify-icon> <span class="font-medium text-tertiary-500 dark:text-primary-500"> </span> <span class="font-medium text-surface-400"> </span></div>',
		2
	),
	nt = W(
		'<!> <!> <div class="space-y-2"><div class="flex items-center justify-between mb-1"><div class="flex items-center gap-2"><span class="font-bold text-sm">Schema.org JSON-LD</span> <iconify-icon></iconify-icon></div> <!></div> <div class="relative"><textarea id="seo-schemaMarkup" class="textarea font-mono text-xs" rows="10"></textarea></div> <p class="text-xs text-surface-400">Paste valid JSON-LD structure here.</p></div>',
		3
	),
	ot = W(
		'<div class="space-y-4"><div class="grid grid-cols-1 lg:grid-cols-3 gap-6"><div class="lg:col-span-2 space-y-4"><!></div> <div class="lg:col-span-1"><!></div></div> <div class="card p-4 variant-glass-surface"><div class="flex border-b border-surface-400/30 mb-6"><button>Basic</button> <!> <!></div> <div class="mt-4 space-y-4"><!></div></div></div>'
	);
function xt(H, e) {
	Ke(e, !0);
	let t = Fe(e, 'value', 15),
		i = X(0),
		a = X(null),
		n = X(!1),
		s = X(!1),
		d = X(ze([]));
	const p = c(() => Ye.contentLanguage);
	let o = c(() => r(p) || 'en');
	(Ae(() => {
		(t() || t({}),
			t()[r(o)] ||
				t(
					(t()[r(o)] = {
						title: '',
						description: '',
						focusKeyword: '',
						robotsMeta: 'index, follow',
						canonicalUrl: '',
						ogTitle: '',
						ogDescription: '',
						ogImage: '',
						twitterCard: 'summary_large_image',
						twitterTitle: '',
						twitterDescription: '',
						twitterImage: '',
						schemaMarkup: ''
					}),
					!0
				),
			te.AVAILABLE_CONTENT_LANGUAGES ? z(d, [te.DEFAULT_CONTENT_LANGUAGE || 'en', ...te.AVAILABLE_CONTENT_LANGUAGES], !0) : z(d, ['en'], !0));
	}),
		Me(() => {
			const l = t()?.[r(o)];
			if (!l) return;
			(l.title, l.description, l.focusKeyword, l.canonicalUrl, l.robotsMeta);
			const g = setTimeout(() => {
				k();
			}, 300);
			return () => clearTimeout(g);
		}));
	async function k() {
		if (!t() || !t()[r(o)]) return;
		z(s, !0);
		const l = '';
		try {
			z(a, await Ze(t()[r(o)], l), !0);
		} catch (g) {
			console.error('SEO Analysis failed', g);
		} finally {
			z(s, !1);
		}
	}
	function m(l) {
		return e.field.defaults?.features?.includes(l) ?? !0;
	}
	function f(l) {
		if (!t() || r(d).length === 0) return 0;
		const g = t(),
			Y = r(d).filter((ge) => {
				const re = g[ge];
				if (!re) return !1;
				const U = re[l];
				return typeof U == 'string' && U.trim() !== '';
			}).length;
		return Math.round((Y / r(d).length) * 100);
	}
	const u = (l, g) => {
			!t() || !t()[r(o)] || t((t()[r(o)][l] = g), !0);
		},
		w = c(() => e.field.translated),
		G = '{"@context": "https://schema.org", "@type": "Article", ...}';
	var F = ot(),
		T = y(F),
		le = y(T),
		_e = y(le);
	{
		let l = c(() => t()?.[r(o)]?.title || ''),
			g = c(() => t()?.[r(o)]?.description || ''),
			Y = c(() => `${te.HOST_PROD}/${t()?.[r(o)]?.canonicalUrl || ''}`);
		je(_e, {
			get title() {
				return r(l);
			},
			get description() {
				return r(g);
			},
			get hostUrl() {
				return r(Y);
			},
			SeoPreviewToggle: !1
		});
	}
	v(le);
	var ye = h(le, 2),
		xe = y(ye);
	(qe(xe, {
		get analysisResult() {
			return r(a);
		},
		get isAnalyzing() {
			return r(s);
		},
		get expanded() {
			return r(n);
		},
		set expanded(l) {
			z(n, l, !0);
		}
	}),
		v(ye),
		v(T));
	var ve = h(T, 2),
		ce = y(ve),
		de = y(ce);
	de.__click = () => z(i, 0);
	var me = h(de, 2);
	{
		var ke = (l) => {
			var g = Qe();
			((g.__click = () => z(i, 1)),
				ee(() =>
					pe(
						g,
						1,
						`px-4 py-2 border-b-2 transition-colors hover:bg-surface-100 dark:hover:bg-surface-700/50 ${r(i) === 1 ? 'border-primary-500 font-bold text-primary-500' : 'border-transparent text-surface-600 dark:text-surface-50 hover:text-surface-900 dark:hover:text-surface-200'}`
					)
				),
				x(l, g));
		};
		I(me, (l) => {
			m('social') && l(ke);
		});
	}
	var Te = h(me, 2);
	{
		var Se = (l) => {
			var g = Xe();
			((g.__click = () => z(i, 2)),
				ee(() =>
					pe(
						g,
						1,
						`px-4 py-2 border-b-2 transition-colors hover:bg-surface-100 dark:hover:bg-surface-700/50 ${r(i) === 2 ? 'border-primary-500 font-bold text-primary-500' : 'border-transparent text-surface-600 dark:text-surface-50 hover:text-surface-900 dark:hover:text-surface-200'}`
					)
				),
				x(l, g));
		};
		I(Te, (l) => {
			m('advanced') && l(Se);
		});
	}
	v(ce);
	var ue = h(ce, 2),
		Le = y(ue);
	{
		var Ce = (l) => {
			var g = fe(),
				Y = N(g);
			{
				var ge = (U) => {
						var B = et(),
							ie = N(B);
						{
							let b = c(() => f('title'));
							M(ie, {
								id: 'seo-title',
								label: 'Title',
								get value() {
									return t()[r(o)].title;
								},
								get field() {
									return e.field;
								},
								get lang() {
									return r(o);
								},
								get translated() {
									return r(w);
								},
								get translationPct() {
									return r(b);
								},
								onUpdate: (S) => u('title', S),
								maxLength: 60,
								optimalMin: 50,
								optimalMax: 60,
								placeholder: 'Page Title'
							});
						}
						var ae = h(ie, 2);
						{
							let b = c(() => f('description'));
							M(ae, {
								id: 'seo-description',
								label: 'Description',
								type: 'textarea',
								get value() {
									return t()[r(o)].description;
								},
								get field() {
									return e.field;
								},
								get lang() {
									return r(o);
								},
								get translated() {
									return r(w);
								},
								get translationPct() {
									return r(b);
								},
								onUpdate: (S) => u('description', S),
								maxLength: 160,
								optimalMin: 150,
								optimalMax: 160,
								placeholder: 'Page Description'
							});
						}
						var he = h(ae, 2);
						{
							let b = c(() => f('focusKeyword'));
							M(he, {
								id: 'seo-focusKeyword',
								label: 'Focus Keyword',
								get value() {
									return t()[r(o)].focusKeyword;
								},
								get field() {
									return e.field;
								},
								get lang() {
									return r(o);
								},
								get translated() {
									return r(w);
								},
								get translationPct() {
									return r(b);
								},
								onUpdate: (S) => u('focusKeyword', S),
								placeholder: 'Main keyword'
							});
						}
						x(U, B);
					},
					re = (U) => {
						var B = fe(),
							ie = N(B);
						{
							var ae = (b) => {
									var S = tt(),
										q = N(S),
										j = y(q),
										V = h(y(j), 2);
									{
										let _ = c(() => t()[r(o)].ogTitle || ''),
											L = c(() => f('ogTitle'));
										M(V, {
											id: 'seo-ogTitle',
											label: 'OG Title',
											get value() {
												return r(_);
											},
											get field() {
												return e.field;
											},
											get lang() {
												return r(o);
											},
											get translated() {
												return r(w);
											},
											get translationPct() {
												return r(L);
											},
											onUpdate: (C) => u('ogTitle', C),
											placeholder: 'Open Graph Title (same as Title if empty)'
										});
									}
									var ne = h(V, 2);
									{
										let _ = c(() => t()[r(o)].ogDescription || ''),
											L = c(() => f('ogDescription'));
										M(ne, {
											id: 'seo-ogDescription',
											label: 'OG Description',
											type: 'textarea',
											get value() {
												return r(_);
											},
											get field() {
												return e.field;
											},
											get lang() {
												return r(o);
											},
											get translated() {
												return r(w);
											},
											get translationPct() {
												return r(L);
											},
											onUpdate: (C) => u('ogDescription', C),
											placeholder: 'Open Graph Description'
										});
									}
									v(j);
									var $ = h(j, 2),
										J = h(y($), 2);
									{
										let _ = c(() => t()[r(o)].twitterTitle || ''),
											L = c(() => f('twitterTitle'));
										M(J, {
											id: 'seo-twitterTitle',
											label: 'Twitter Title',
											get value() {
												return r(_);
											},
											get field() {
												return e.field;
											},
											get lang() {
												return r(o);
											},
											get translated() {
												return r(w);
											},
											get translationPct() {
												return r(L);
											},
											onUpdate: (C) => u('twitterTitle', C),
											placeholder: 'Twitter Title'
										});
									}
									var oe = h(J, 2);
									{
										let _ = c(() => t()[r(o)].twitterDescription || ''),
											L = c(() => f('twitterDescription'));
										M(oe, {
											id: 'seo-twitterDescription',
											label: 'Twitter Description',
											type: 'textarea',
											get value() {
												return r(_);
											},
											get field() {
												return e.field;
											},
											get lang() {
												return r(o);
											},
											get translated() {
												return r(w);
											},
											get translationPct() {
												return r(L);
											},
											onUpdate: (C) => u('twitterDescription', C),
											placeholder: 'Twitter Description'
										});
									}
									(v($), v(q));
									var E = h(q, 2),
										Z = y(E);
									{
										let _ = c(() => t()[r(o)].ogTitle || t()[r(o)].title),
											L = c(() => t()[r(o)].ogDescription || t()[r(o)].description),
											C = c(() => t()[r(o)].twitterTitle || t()[r(o)].title),
											se = c(() => t()[r(o)].twitterDescription || t()[r(o)].description);
										$e(Z, {
											get ogTitle() {
												return r(_);
											},
											get ogDescription() {
												return r(L);
											},
											get twitterTitle() {
												return r(C);
											},
											get twitterDescription() {
												return r(se);
											},
											get hostUrl() {
												return te.HOST_PROD;
											}
										});
									}
									(v(E), x(b, S));
								},
								he = (b) => {
									var S = fe(),
										q = N(S);
									{
										var j = (V) => {
											var ne = nt(),
												$ = N(ne);
											{
												const P = (D) => {
													var K = rt();
													(O(K, 'icon', 'mdi:robot-happy-outline'), O(K, 'width', '16'), x(D, K));
												};
												let A = c(() => t()[r(o)].robotsMeta || ''),
													R = c(() => f('robotsMeta'));
												M($, {
													id: 'seo-robotsMeta',
													label: 'Robots Meta',
													get value() {
														return r(A);
													},
													get field() {
														return e.field;
													},
													get lang() {
														return r(o);
													},
													get translated() {
														return r(w);
													},
													get translationPct() {
														return r(R);
													},
													onUpdate: (D) => u('robotsMeta', D),
													placeholder: 'index, follow',
													icon: P,
													$$slots: { icon: !0 }
												});
											}
											var J = h($, 2);
											{
												const P = (D) => {
													var K = it();
													(O(K, 'icon', 'mdi:link-variant'), O(K, 'width', '16'), x(D, K));
												};
												let A = c(() => t()[r(o)].canonicalUrl || ''),
													R = c(() => f('canonicalUrl'));
												M(J, {
													id: 'seo-canonicalUrl',
													label: 'Canonical URL',
													get value() {
														return r(A);
													},
													get field() {
														return e.field;
													},
													get lang() {
														return r(o);
													},
													get translated() {
														return r(w);
													},
													get translationPct() {
														return r(R);
													},
													onUpdate: (D) => u('canonicalUrl', D),
													placeholder: 'https://example.com/slug',
													icon: P,
													$$slots: { icon: !0 }
												});
											}
											var oe = h(J, 2),
												E = y(oe),
												Z = y(E),
												_ = h(y(Z), 2);
											(O(_, 'icon', 'mdi:code-json'), O(_, 'width', '16'), v(Z));
											var L = h(Z, 2);
											{
												var C = (P) => {
													var A = at(),
														R = y(A);
													(O(R, 'icon', 'bi:translate'), O(R, 'width', '16'));
													var D = h(R, 2),
														K = y(D, !0);
													v(D);
													var we = h(D, 2),
														Pe = y(we);
													(v(we),
														v(A),
														ee(
															(De, Ue) => {
																(be(K, De), be(Pe, `(${Ue ?? ''}%)`));
															},
															[() => r(o).toUpperCase(), () => f('schemaMarkup')]
														),
														x(P, A));
												};
												I(L, (P) => {
													r(w) && P(C);
												});
											}
											v(E);
											var se = h(E, 2),
												Q = y(se);
											(Oe(Q),
												Ne(Q, 'placeholder', G),
												(Q.__input = (P) => u('schemaMarkup', P.currentTarget.value)),
												Ee(
													Q,
													(P, A) => Be?.(P, A),
													() => ({ name: e.field.db_fieldName, label: e.field.label, collection: e.field.collection })
												),
												v(se),
												He(2),
												v(oe),
												ee(() => Ge(Q, t()[r(o)].schemaMarkup || '')),
												x(V, ne));
										};
										I(
											q,
											(V) => {
												r(i) === 2 && V(j);
											},
											!0
										);
									}
									x(b, S);
								};
							I(
								ie,
								(b) => {
									r(i) === 1 ? b(ae) : b(he, !1);
								},
								!0
							);
						}
						x(U, B);
					};
				I(Y, (U) => {
					r(i) === 0 ? U(ge) : U(re, !1);
				});
			}
			x(l, g);
		};
		I(Le, (l) => {
			t() && t()[r(o)] && l(Ce);
		});
	}
	(v(ue),
		v(ve),
		v(F),
		ee(() =>
			pe(
				de,
				1,
				`px-4 py-2 border-b-2 transition-colors hover:bg-surface-100 dark:hover:bg-surface-700/50 ${r(i) === 0 ? 'border-primary-500 font-bold text-primary-500' : 'border-transparent text-surface-600 dark:text-surface-50 hover:text-surface-900 dark:hover:text-surface-200'}`
			)
		),
		Ie(3, ue, () => Ve),
		x(H, F),
		We());
}
Re(['click', 'input']);
export { xt as default };
//# sourceMappingURL=D8d05dZN.js.map
