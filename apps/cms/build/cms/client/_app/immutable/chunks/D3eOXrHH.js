import { S as a } from './D3eWcrZU.js';
import { p as C } from './C9E6SjbS.js';
import {
	K as w,
	L as S,
	M as A,
	N as $,
	O as x,
	P as D,
	Q as T,
	R as F,
	o as v,
	S as U,
	T as k,
	U as P,
	V as O,
	W as M,
	X as N,
	Y as L,
	Z as V,
	_ as R,
	$ as I,
	a0 as J,
	a1 as Y,
	a2 as j,
	a3 as B,
	a4 as H,
	a5 as K,
	a6 as m,
	a7 as Q,
	a8 as W,
	a9 as X,
	aa as Z,
	ab as q,
	ac as z,
	ad as G,
	ae as ee,
	af as te,
	ag as se,
	ah as ne,
	ai as re,
	aj as ae,
	ak as ie,
	al as oe,
	am as ce
} from './N8Jg0v49.js';
import { a as u, s as h, b as _, d as b } from './-PV6rnhC.js';
import { t as i } from './C-hhfhAN.js';
import { l as le } from './BvngfGKt.js';
import { u as de, c as g, i as p, d as ue, a as ye, b as he, e as fe } from './DVb8jQhQ.js';
import { a as _e, b as f } from './Cl42wY7v.js';
const d = {
	entriesArchived: (e) => re?.({}) || `${e} ${e === 1 ? 'entry' : 'entries'} archived successfully`,
	entriesPublished: (e) => ne?.({}) || `${e} ${e === 1 ? 'entry' : 'entries'} published successfully`,
	entriesUnpublished: (e) => se?.({}) || `${e} ${e === 1 ? 'entry' : 'entries'} unpublished successfully`,
	entriesSetToTest: (e) => te?.({}) || `${e} ${e === 1 ? 'entry' : 'entries'} set to test successfully`,
	entriesDeleted: (e) => ee?.({}) || `${e} ${e === 1 ? 'entry' : 'entries'} deleted successfully`,
	entriesScheduled: (e) => G?.({}) || `${e} ${e === 1 ? 'entry' : 'entries'} scheduled successfully`,
	entriesCloned: (e) => z?.({}) || `${e} ${e === 1 ? 'entry' : 'entries'} cloned successfully`,
	entriesUpdated: (e, s) => q?.({}) || `${e} ${e === 1 ? 'entry' : 'entries'} updated to ${s}`,
	updateFailed: (e) => w?.({}) || `Failed to ${e} entries`,
	deleteFailed: (e) => Z?.({}) || `Failed to ${e} entries`,
	noEntriesSelected: () => X?.() || 'No entries selected',
	noCollectionFound: () => W?.() || 'Collection not found',
	entryArchived: () => Q?.() || 'Entry archived successfully',
	entryDeleted: () => m?.() || 'Entry deleted successfully',
	entrySaved: () => K?.() || 'Entry saved successfully',
	entryStatusUpdated: (e) => H?.({ status: e }) || `Entry status updated to ${e}`,
	entryScheduled: (e) => B?.({}) || `Entry scheduled for ${e}`,
	entryCloned: () => j?.() || 'Entry cloned successfully',
	onlyAdminsCanDelete: () => Y?.() || 'Only administrators can delete archived entries',
	statusReservedForSystem: (e) => J?.({}) || `${e} status is reserved for system operations`,
	unsavedChangesTitle: () => I?.() || 'Unsaved Changes',
	unsavedChangesBody: () => R?.() || 'You have unsaved changes. Do you want to save them as a draft before leaving?',
	saveAsDraftAndLeave: () => V?.() || 'Save as Draft and Leave',
	stayAndContinueEditing: () => L?.() || 'Stay and Continue Editing',
	changesSavedAsDraft: () => N?.() || 'Changes saved as draft',
	errorSavingDraft: (e) => M?.({}) || `Error saving draft: ${e}`,
	noEntryForScheduling: () => O?.() || 'No entry selected for scheduling',
	entryScheduledStatus: () => P?.() || 'Entry status changed to scheduled',
	errorScheduling: (e) => k?.({}) || `Error scheduling entry: ${e}`,
	confirm: () => U?.() || 'Confirm',
	cancel: () => v?.() || 'Cancel',
	delete: () => F?.() || 'Delete',
	archive: () => T?.() || 'Archive',
	publish: () => D?.() || 'Publish',
	unpublish: () => x?.() || 'Unpublish',
	schedule: () => $?.() || 'Schedule',
	clone: () => A?.() || 'Clone',
	test: () => S?.() || 'Test'
};
async function pe(e, s, r) {
	const t = await ye(e, s, r);
	if (!t.success) throw new Error(t.error || 'Failed to update status');
	return t;
}
async function xe(e, s, r, t = {}) {
	if (!e.length) return;
	const n = u.value?._id;
	if (!n) return;
	const o = await fe(n, { ids: e, status: s, ...t });
	if (o.success) {
		const c = e.length;
		let l;
		switch (s) {
			case a.archive:
				l = d.entriesArchived(c);
				break;
			case a.publish:
				l = d.entriesPublished(c);
				break;
			case a.unpublish:
				l = d.entriesUnpublished(c);
				break;
			case a.draft:
				l = d.entriesUpdated(c, a.draft);
				break;
			default:
				l = d.entriesUpdated(c, s);
		}
		(i.success({ description: l }), r());
	} else i.error({ description: o.error || d.updateFailed('update') });
}
async function De(e, s) {
	if (!e.length) return;
	const r = u.value?._id;
	if (!r) return;
	const t = e.map((o) => {
			const { _id: c, createdAt: l, updatedAt: me, ...E } = o;
			return { ...E, clonedFrom: c };
		}),
		n = await he(r, t);
	n.success ? (i.success({ description: 'Entries cloned' }), s()) : i.error({ description: n.error || 'Failed to clone entries' });
}
async function Te(e, s = !1) {
	const r = u.value?._id;
	if (!r) return (i.warning({ description: 'Collection not found' }), !1);
	const t = e._id,
		n = { ...e };
	s ? (n.status = a.publish) : n.status || (n.status = u.value?.status || a.draft);
	const o = t ? await de(r, t, n) : await g(r, n);
	return o.success
		? (i.success({ description: 'Entry saved' }),
			o.data && h(o.data),
			p(r),
			typeof document < 'u' && document.dispatchEvent(new CustomEvent('clearEntryListCache', { detail: { reason: 'entry-saved', collectionId: r } })),
			!0)
		: (i.error({ description: o.error || 'Failed to save entry' }), !1);
}
async function Fe(e = !1) {
	const s = _.value,
		r = u.value;
	if (!s?._id || !r?._id) {
		i.warning({ description: ie() });
		return;
	}
	const t = r._id,
		n = s._id,
		c = (s.status || a.draft) === a.archive;
	C.USE_ARCHIVE_ON_DELETE
		? c
			? e
				? y(t, n, a.delete)
				: i.warning({ description: 'Only administrators can delete archived entries.' })
			: e
				? ve(t, n)
				: y(t, n, a.archive)
		: y(t, n, a.delete);
}
function ve(e, s) {
	f({
		title: 'Archive Entry',
		body: `
			<div class="space-y-3">
				<p>Do you want to <strong class="text-warning-600">archive</strong> this entry?</p>
				<p class="text-sm text-surface-600 dark:text-surface-50">Archived entries are hidden from view but kept in the database and can be restored later.</p>
			</div>
		`,
		confirmText: 'Archive',
		cancelText: 'Show Delete Option',
		onConfirm: () => y(e, s, a.archive),
		onCancel: () =>
			f({
				title: 'Delete Entry Permanently',
				body: `
					<div class="space-y-3">
						<p>Do you want to <strong class="text-error-600">permanently delete</strong> this entry?</p>
						<p class="text-sm text-surface-600 dark:text-surface-50">This will completely remove the entry from the database. This action cannot be undone.</p>
					</div>
				`,
				confirmText: 'Delete Permanently',
				onConfirm: () => y(e, s, a.delete)
			})
	});
}
function y(e, s, r) {
	const t = r === a.archive;
	f({
		title: `Please Confirm <span class="text-error-500 font-bold">${t ? 'Archiving' : 'Deletion'}</span>`,
		body: t
			? 'Are you sure you want to <span class="text-warning-500 font-semibold">archive</span> this entry? Archived items can be restored later.'
			: 'Are you sure you want to <span class="text-error-500 font-semibold">delete</span> this entry? This action will remove the entry from the system.',
		confirmText: t ? 'Archive' : 'Delete',
		cancelText: v(),
		onConfirm: async () => {
			try {
				(t
					? (await pe(e, s, a.archive), h({ ..._.value, status: a.archive }), i.success({ description: 'Entry archived successfully.' }))
					: (await ue(e, s), i.success({ description: m() })),
					b('view'),
					h({}),
					p(e));
			} catch (n) {
				i.error({ description: oe({ error: n.message }) });
			}
		}
	});
}
async function Ue() {
	const e = _.value,
		s = u.value;
	if (!e || !s?._id) {
		i.warning({ description: ae() });
		return;
	}
	const r = s._id;
	_e({
		count: 1,
		onConfirm: async () => {
			try {
				const t = JSON.parse(JSON.stringify(e));
				(delete t._id,
					delete t.createdAt,
					delete t.updatedAt,
					(t.status = a.draft),
					(t.clonedFrom = e._id),
					le.debug('Cloning entry with payload:', t));
				const n = await g(r, t);
				if (n.success) (i.success({ description: d.entryCloned() }), p(r), b('view'));
				else throw new Error(n.error || 'Failed to create clone');
			} catch (t) {
				i.error({ description: ce({ error: t.message }) });
			}
		}
	});
}
export { Te as a, Ue as b, De as c, Fe as d, xe as s };
//# sourceMappingURL=D3eOXrHH.js.map
