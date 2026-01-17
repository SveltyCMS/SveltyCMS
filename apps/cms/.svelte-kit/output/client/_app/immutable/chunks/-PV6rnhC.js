import { d as i, x as u, g as s, b as a, y as m, z as S, B as v } from './DrlZFkx8.js';
import { l as b } from './BvngfGKt.js';
import { S as l, s as g } from './BRE7FZu4.js';
class p {
	#e = i(u({}));
	get all() {
		return s(this.#e);
	}
	set all(e) {
		a(this.#e, e, !0);
	}
	#t = i(null);
	get active() {
		return s(this.#t);
	}
	set active(e) {
		a(this.#t, e, !0);
	}
	#r = i(u({}));
	get activeValue() {
		return s(this.#r);
	}
	set activeValue(e) {
		a(this.#r, e, !0);
	}
	#i = i('view');
	get mode() {
		return s(this.#i);
	}
	set mode(e) {
		a(this.#i, e, !0);
	}
	#s = i(!1);
	get loading() {
		return s(this.#s);
	}
	set loading(e) {
		a(this.#s, e, !0);
	}
	#a = i(null);
	get error() {
		return s(this.#a);
	}
	set error(e) {
		a(this.#a, e, !0);
	}
	#n = i(null);
	get currentId() {
		return s(this.#n);
	}
	set currentId(e) {
		a(this.#n, e, !0);
	}
	#d = i(u({}));
	get unassigned() {
		return s(this.#d);
	}
	set unassigned(e) {
		a(this.#d, e, !0);
	}
	#o = i(() => Promise.resolve());
	get modifyEntry() {
		return s(this.#o);
	}
	set modifyEntry(e) {
		a(this.#o, e, !0);
	}
	#u = i(u({ permissions: {} }));
	get targetWidget() {
		return s(this.#u);
	}
	set targetWidget(e) {
		a(this.#u, e, !0);
	}
	#l = i(u([]));
	get contentStructure() {
		return s(this.#l);
	}
	set contentStructure(e) {
		a(this.#l, e, !0);
	}
	#h = i(u([]));
	get selectedEntries() {
		return s(this.#h);
	}
	set selectedEntries(e) {
		a(this.#h, e, !0);
	}
	get total() {
		return Object.keys(this.all).length;
	}
	get hasSelected() {
		return this.selectedEntries.length > 0;
	}
	get activeName() {
		return this.active?.name;
	}
	setCollection(e) {
		this.active = e;
	}
	setMode(e) {
		(b.debug(`CollectionState: mode changed from ${this.mode} to ${e}`), (this.mode = e));
	}
	setCollectionValue(e) {
		((this.activeValue = e), this.activeValue && !('status' in this.activeValue) && (this.activeValue.status = this.active?.status ?? 'unpublish'));
	}
	setModifyEntry(e) {
		this.modifyEntry = e;
	}
	setContentStructure(e) {
		this.contentStructure = e;
	}
	setTargetWidget(e) {
		this.targetWidget = e;
	}
	addEntry(e) {
		this.selectedEntries.includes(e) || this.selectedEntries.push(e);
	}
	removeEntry(e) {
		const n = this.selectedEntries.indexOf(e);
		n > -1 && this.selectedEntries.splice(n, 1);
	}
	clearSelected() {
		this.selectedEntries.length = 0;
	}
	get current() {
		return this.active;
	}
	set current(e) {
		this.active = e;
	}
}
const r = new p(),
	x = {
		get value() {
			return r.active;
		},
		set value(t) {
			r.active = t;
		}
	},
	M = {
		get value() {
			return r.activeValue;
		},
		set value(t) {
			r.setCollectionValue(t);
		}
	},
	f = {
		get value() {
			return r.mode;
		},
		set value(t) {
			r.setMode(t);
		}
	},
	T = {
		get value() {
			return r.contentStructure;
		},
		set value(t) {
			r.contentStructure = t;
		}
	},
	w = {
		get value() {
			return r.targetWidget;
		},
		set value(t) {
			r.targetWidget = t;
		}
	},
	W = (t) => r.setCollection(t),
	P = (t) => r.setMode(t),
	I = (t) => r.setCollectionValue(t),
	O = (t) => r.setModifyEntry(t),
	A = (t) => r.setContentStructure(t),
	k = (t) => r.setTargetWidget(t);
r.currentId;
r.loading;
r.error;
r.unassigned;
r.selectedEntries;
class C {
	#e = i(u({ leftSidebar: 'full', rightSidebar: 'hidden', pageheader: 'full', pagefooter: 'hidden', header: 'hidden', footer: 'hidden' }));
	get state() {
		return s(this.#e);
	}
	set state(e) {
		a(this.#e, e, !0);
	}
	#t = i(u({ isImageEditor: !1, isCollectionBuilder: !1 }));
	get routeContext() {
		return s(this.#t);
	}
	set routeContext(e) {
		a(this.#t, e, !0);
	}
	#r = i(!1);
	get manualOverrideActive() {
		return s(this.#r);
	}
	set manualOverrideActive(e) {
		a(this.#r, e, !0);
	}
	#i = i(!1);
	get headerShowMore() {
		return s(this.#i);
	}
	set headerShowMore(e) {
		a(this.#i, e, !0);
	}
	#s = i(!1);
	get isSearchVisible() {
		return s(this.#s);
	}
	set isSearchVisible(e) {
		a(this.#s, e, !0);
	}
	#a = i('collapsed');
	get userPreferred() {
		return s(this.#a);
	}
	set userPreferred(e) {
		a(this.#a, e, !0);
	}
	manualTimer = null;
	effectCleanup;
	get isLeftSidebarVisible() {
		return this.state.leftSidebar !== 'hidden';
	}
	get isRightSidebarVisible() {
		return this.state.rightSidebar !== 'hidden';
	}
	get isPageHeaderVisible() {
		return this.state.pageheader !== 'hidden';
	}
	get isPageFooterVisible() {
		return this.state.pagefooter !== 'hidden';
	}
	get isHeaderVisible() {
		return this.state.header !== 'hidden';
	}
	get isFooterVisible() {
		return this.state.footer !== 'hidden';
	}
	constructor() {
		typeof window > 'u' ||
			(this.effectCleanup = m(() => {
				S(() => {
					const e = g.size,
						n = f.value;
					(this.routeContext.isImageEditor || this.routeContext.isCollectionBuilder,
						v(() => {
							this.manualOverrideActive || this.updateFromContext(e, n);
						}));
				});
			}));
	}
	updateFromContext(e, n) {
		const o = n === 'view' || n === 'media';
		if (this.routeContext.isImageEditor) {
			this.state = { leftSidebar: 'collapsed', rightSidebar: 'hidden', pageheader: 'full', pagefooter: 'full', header: 'hidden', footer: 'hidden' };
			return;
		}
		if (this.routeContext.isCollectionBuilder) {
			let c = 'full';
			(e === l.XS || e === l.SM ? (c = 'hidden') : e === l.MD && (c = 'collapsed'),
				(this.state = { leftSidebar: c, rightSidebar: 'hidden', pageheader: 'hidden', pagefooter: 'hidden', header: 'hidden', footer: 'hidden' }));
			return;
		}
		const h = ['edit', 'create', 'modify', 'media'].includes(n);
		if (e === l.XS || e === l.SM) {
			this.state = {
				leftSidebar: 'hidden',
				rightSidebar: 'hidden',
				pageheader: h ? 'full' : 'hidden',
				pagefooter: 'hidden',
				header: 'hidden',
				footer: 'hidden'
			};
			return;
		}
		if (e === l.MD) {
			this.state = {
				leftSidebar: o ? 'collapsed' : 'hidden',
				rightSidebar: 'hidden',
				pageheader: h ? 'full' : 'hidden',
				pagefooter: 'hidden',
				header: 'hidden',
				footer: 'hidden'
			};
			return;
		}
		this.state = {
			leftSidebar: o ? 'full' : 'collapsed',
			rightSidebar: o ? 'hidden' : 'full',
			pageheader: h ? 'full' : 'hidden',
			pagefooter: 'hidden',
			header: 'hidden',
			footer: 'hidden'
		};
	}
	toggle(e, n) {
		((this.state[e] = n),
			(e === 'leftSidebar' || e === 'rightSidebar') &&
				((this.manualOverrideActive = !0),
				this.manualTimer && clearTimeout(this.manualTimer),
				(this.manualTimer = setTimeout(() => {
					((this.manualOverrideActive = !1), (this.manualTimer = null));
				}, 600))));
	}
	setRouteContext(e) {
		for (const n in e) {
			const o = n;
			this.routeContext[o] !== e[o] && (this.routeContext[o] = e[o] ?? !1);
		}
	}
	forceUpdate() {
		this.updateFromContext(g.size, f.value);
	}
	destroy() {
		(this.manualTimer && (clearTimeout(this.manualTimer), (this.manualTimer = null)), this.effectCleanup?.());
	}
}
const d = new C();
function F(t, e) {
	d.toggle(t, e);
}
const B = {
		get uiState() {
			return { value: d.state };
		},
		toggle: d.toggle.bind(d)
	},
	R = {
		get leftSidebar() {
			return d.state.leftSidebar;
		},
		get rightSidebar() {
			return d.state.rightSidebar;
		},
		get pageheader() {
			return d.state.pageheader;
		},
		set(t) {
			d.userPreferred = t;
		}
	},
	H = d.setRouteContext.bind(d);
export { x as a, M as b, r as c, P as d, T as e, H as f, A as g, W as h, k as i, O as j, B as k, F as l, f as m, R as n, I as s, w as t, d as u };
//# sourceMappingURL=-PV6rnhC.js.map
