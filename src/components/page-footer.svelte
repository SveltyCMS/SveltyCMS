<!--
@file src/components/page-footer.svelte
@component
**PageFooter — entry authorship and revision summary for edit/create routes.**

Shows the persisted timestamps, authors, and revision count in the desktop
footer when the right sidebar is unavailable. View routes render nothing.

### Features
- Created / updated timestamps with their authors (UUIDs are shortened)
- Revision count from the current route's `revisions` data
- Hidden outside entry edit/create/modify modes
-->

<script lang="ts">
	import { collections } from '@src/stores/collection-store.svelte';
	import { page } from '$app/state';
	import { formatDateTime } from '@utils/format-date';
	import { applayout_version, sidebar_created, sidebar_updated } from '@src/paraglide/messages';

	interface EntryMeta {
		_id?: string;
		createdAt?: string | number | Date;
		updatedAt?: string | number | Date;
		createdBy?: string;
		updatedBy?: string;
	}

	const user = $derived(page.data?.user);

	const activeEntry = $derived(collections.activeValue as EntryMeta | undefined);

	const revisions = $derived.by(() => {
		const value = (page.data as { revisions?: unknown }).revisions;
		return Array.isArray(value) ? value : [];
	});

	// Only entry editors produce meaningful metadata; the collection builder also
	// enables the footer but has no active entry.
	const showEntryMeta = $derived(
		['edit', 'create', 'modify'].includes(collections.mode) &&
			Boolean(activeEntry?._id || activeEntry?.createdAt || activeEntry?.updatedAt)
	);

	const isUuid = (value: string): boolean =>
		/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(value);

	/** Persisted author or the signing-in user when the entry predates authorship. */
	function displayAuthor(value: string | undefined): string {
		if (!value) return user?.username || 'Unknown';
		if (!isUuid(value)) return value;
		if (value === user?._id) return user.username || user.email?.split('@')[0] || 'You';
		return `User ${value.substring(0, 8)}…`;
	}

	const formatEntryDate = (value: EntryMeta['createdAt']): string =>
		value
			? formatDateTime(value, {
					year: 'numeric',
					month: '2-digit',
					day: '2-digit',
					hour: '2-digit',
					minute: '2-digit'
				})
			: '-';

	const dates = $derived({
		created: formatEntryDate(activeEntry?.createdAt),
		updated: formatEntryDate(activeEntry?.updatedAt)
	});

	const authors = $derived({
		created: displayAuthor(activeEntry?.createdBy),
		updated: displayAuthor(activeEntry?.updatedBy)
	});
</script>

{#if showEntryMeta}
	<div
		class="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 border-t border-surface-500 py-2 text-[12px] leading-tight"
	>
		<span class="inline-flex flex-wrap items-center justify-center gap-1">
			<span class="font-bold">{sidebar_created()}</span>
			<span class="text-surface-600 dark:text-surface-50">{dates.created}</span>
			<span class="text-surface-600 dark:text-surface-50">by {authors.created}</span>
		</span>

		<span class="inline-flex flex-wrap items-center justify-center gap-1">
			<span class="font-bold">{sidebar_updated()}</span>
			<span class="text-tertiary-500 dark:text-primary-500">{dates.updated}</span>
			<span class="text-surface-600 dark:text-surface-50">by {authors.updated}</span>
		</span>

		{#if revisions.length > 0}
			<span class="inline-flex items-center gap-1">
				<span class="font-bold">{applayout_version()}</span>
				<span class="text-tertiary-500 dark:text-primary-500">{revisions.length}</span>
			</span>
		{/if}
	</div>
{/if}
