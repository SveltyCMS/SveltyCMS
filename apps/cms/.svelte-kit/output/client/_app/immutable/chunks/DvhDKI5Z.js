import { l as a } from './BvngfGKt.js';
function t(r, n) {
	if (!r || r.trim() === '') return r;
	try {
		const e = n || r;
		return !e || e.trim() === '' ? r : new Intl.DisplayNames([e], { type: 'language' }).of(r) || r;
	} catch (e) {
		return (a.warn(`Error getting language name for ${r}:`, e), r);
	}
}
export { t as g };
//# sourceMappingURL=DvhDKI5Z.js.map
