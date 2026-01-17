import { d as s, g as o, b as r, x as l } from './DrlZFkx8.js';
import { S as g, a as d } from './C9E6SjbS.js';
const f = {
	navigation: 'navigation',
	dataFetch: 'data-fetch',
	authentication: 'authentication',
	configSave: 'config-save',
	tokenGeneration: 'token-generation'
};
class c {
	#t = s(!1);
	get _isLoading() {
		return o(this.#t);
	}
	set _isLoading(t) {
		r(this.#t, t, !0);
	}
	#i = s(null);
	get _loadingReason() {
		return o(this.#i);
	}
	set _loadingReason(t) {
		r(this.#i, t, !0);
	}
	#e = s(l(new g()));
	get _loadingStack() {
		return o(this.#e);
	}
	set _loadingStack(t) {
		r(this.#e, t, !0);
	}
	_loadingEntries = new d();
	_maxTimeout = 3e4;
	#n = s(null);
	get _progress() {
		return o(this.#n);
	}
	set _progress(t) {
		r(this.#n, t, !0);
	}
	#a = s(!1);
	get _canCancel() {
		return o(this.#a);
	}
	set _canCancel(t) {
		r(this.#a, t, !0);
	}
	#s = s(void 0);
	get _onCancel() {
		return o(this.#s);
	}
	set _onCancel(t) {
		r(this.#s, t, !0);
	}
	get isLoading() {
		return this._isLoading;
	}
	get loadingReason() {
		return this._loadingReason;
	}
	get loadingStack() {
		return this._loadingStack;
	}
	get progress() {
		return this._progress;
	}
	get canCancel() {
		return this._canCancel;
	}
	get onCancel() {
		return this._onCancel;
	}
	startLoading(t, i, e = this._maxTimeout) {
		if (this._loadingStack.has(t)) {
			console.warn(`[LoadingStore] Operation "${t}" already in progress`);
			return;
		}
		const n = setTimeout(() => {
			(console.warn(`[LoadingStore] Auto-cleanup: "${t}" exceeded ${e}ms`), this.stopLoading(t));
		}, e);
		(this._loadingStack.add(t),
			this._loadingEntries.set(t, { reason: t, startTime: Date.now(), context: i, timeoutId: n }),
			(this._isLoading = !0),
			(this._loadingReason = t),
			i && console.debug(`[LoadingStore] Started: ${t} (${i})`));
	}
	stopLoading(t) {
		if (!this._loadingStack.has(t)) return;
		const i = this._loadingEntries.get(t);
		if ((i?.timeoutId && clearTimeout(i.timeoutId), this._loadingEntries.delete(t), this._loadingStack.delete(t), this._loadingStack.size === 0))
			((this._isLoading = !1), (this._loadingReason = null), (this._progress = null), (this._canCancel = !1), (this._onCancel = void 0));
		else {
			const e = Array.from(this._loadingStack),
				n = e[e.length - 1];
			this._loadingReason = n;
			const a = this._loadingEntries.get(n);
			a && ((this._progress = a.progress ?? null), (this._canCancel = a.canCancel ?? !1), (this._onCancel = a.onCancel));
		}
		if (i) {
			const e = Date.now() - i.startTime;
			console.debug(`[LoadingStore] Stopped: ${t} (${e}ms)`);
		}
	}
	updateStatus(t, i, e, n) {
		if (!this._loadingEntries.has(t)) return;
		const a = this._loadingEntries.get(t);
		(i !== void 0 && ((a.progress = i), this._loadingReason === t && (this._progress = i)),
			e !== void 0 && ((a.canCancel = e), this._loadingReason === t && (this._canCancel = e)),
			n !== void 0 && ((a.onCancel = n), this._loadingReason === t && (this._onCancel = n)),
			this._loadingEntries.set(t, a));
	}
	clearLoading() {
		for (const t of this._loadingEntries.values()) t.timeoutId && clearTimeout(t.timeoutId);
		(this._loadingEntries.clear(),
			this._loadingStack.clear(),
			(this._isLoading = !1),
			(this._loadingReason = null),
			(this._progress = null),
			(this._canCancel = !1),
			(this._onCancel = void 0),
			console.warn('[LoadingStore] Force cleared all loading states'));
	}
	isLoadingReason(t) {
		return this._loadingStack.has(t);
	}
	async withLoading(t, i, e) {
		this.startLoading(t, e);
		try {
			return await i();
		} catch (n) {
			throw (console.error(`[LoadingStore] Operation "${t}" failed:`, n), n);
		} finally {
			this.stopLoading(t);
		}
	}
	getStats() {
		return {
			isLoading: this._isLoading,
			currentReason: this._loadingReason,
			activeCount: this._loadingStack.size,
			activeOperations: Array.from(this._loadingStack),
			entries: Array.from(this._loadingEntries.entries()).map(([t, i]) => ({ reason: t, duration: Date.now() - i.startTime, context: i.context }))
		};
	}
}
const S = new c();
export { S as g, f as l };
//# sourceMappingURL=7IKENDK9.js.map
