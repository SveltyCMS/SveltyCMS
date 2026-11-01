<!--
@file src/components/collection-display/draft-resume-banner.svelte
@component
**Draft resume banner** — offers to restore or discard the author's autosaved
draft for the entry currently open in the editor.

Autosave writes a `content_drafts` row, never the live entry. This banner is the
only place the user can apply that row: Restore populates the form (the entry
itself is still created only by Save), Discard deletes the draft and leaves the
live/new baseline untouched.

@props
- `updatedAt` (string): ISO stamp of the draft row (empty hides the line).
- `isNewEntry` (boolean): The draft belongs to an entry that does not exist yet.
- `busy` (boolean): A resume/discard request is in flight — both actions lock.
- `onRestore` (() => void): Apply the draft to the form.
- `onDiscard` (() => void): Delete the draft, keep the current form.

Features:
- Restore/Discard only — never a third "create" action
- Status-shade warning wash, logical properties (RTL/LTR safe)
- `role="status"` + `aria-live="polite"`: announced when the editor opens with a draft
-->

<script lang="ts">
	import AdminCard from '@components/admin-card.svelte';
	import Button from '@components/ui/button.svelte';
	import { systemLanguage } from '@src/stores/locale-store.svelte';
	import { formatDateTime } from '@utils/format-date';

	interface Props {
		updatedAt?: string;
		isNewEntry?: boolean;
		busy?: boolean;
		onRestore: () => void;
		onDiscard: () => void;
	}

	let { updatedAt = '', isNewEntry = false, busy = false, onRestore, onDiscard }: Props = $props();

	const savedAt = $derived(
		formatDateTime(updatedAt || null, undefined, systemLanguage.value || 'en')
	);
</script>

<AdminCard
	class="mb-3 flex flex-wrap items-center gap-3 border-s-4 border-warning-500/40 bg-warning-500/10 p-3"
	data-testid="draft-resume-banner"
	role="status"
	aria-live="polite"
>
	<iconify-icon
		icon="material-symbols:history"
		width="22"
		class="shrink-0 text-warning-500"
		aria-hidden="true"
	></iconify-icon>

	<div class="min-w-0 flex-1 text-start">
		<p class="text-sm font-semibold text-(--admin-text-body)">
			{isNewEntry
				? 'You have an unsaved new entry'
				: 'You have unsaved changes from a previous session'}
		</p>
		{#if savedAt}
			<p class="text-xs text-(--admin-text-muted)">Draft saved {savedAt}</p>
		{/if}
	</div>

	<div class="flex shrink-0 items-center gap-2">
		<Button
			variant="primary"
			size="sm"
			disabled={busy}
			onclick={onRestore}
			data-testid="draft-resume-restore"
		>
			Restore draft
		</Button>
		<Button
			variant="outline"
			size="sm"
			disabled={busy}
			onclick={onDiscard}
			data-testid="draft-resume-discard"
		>
			Discard
		</Button>
	</div>
</AdminCard>
