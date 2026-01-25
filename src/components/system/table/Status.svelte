<!-- 
@file src/components/system/table/Status.svelte
@component
**Status component for table displaying different badges for different statuses**

Values form StatusTypes

@example
<Status value="publish" />

### Props
- `value` {string}: The status value to display

### Features:
- Displays different badges for different statuses
- Uses icons and colors to represent each status visually
-->

<script lang="ts">
	// Import StatusTypes for centralized status management
	import { StatusTypes } from '@src/content/types';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	const { value } = $props(); // The status value to display
</script>

<!-- Display different badges for different statuses -->
<div
	class="flex w-fit min-w-24 items-center justify-center gap-2 rounded px-3 py-1.5 text-center text-white
		{value === StatusTypes.publish
		? 'gradient-primary'
		: value === StatusTypes.unpublish
			? 'gradient-yellow'
			: value === StatusTypes.schedule
				? 'gradient-pink'
				: value === StatusTypes.delete
					? 'bg-surface-500 text-white'
					: value === StatusTypes.clone
						? 'gradient-secondary'
						: value === StatusTypes.draft
							? 'preset-outlined-surface-500 text-surface-900-50-token'
							: value === StatusTypes.archive
								? 'bg-surface-600 text-white'
								: 'badge'}"
>
	{#if value === StatusTypes.publish}
		<iconify-icon icon="bi:hand-thumbs-up-fill" width="16"></iconify-icon>
		<p class="hidden sm:block text-xs font-bold uppercase">{m.entrylist_multibutton_publish()}</p>
	{:else if value === StatusTypes.unpublish}
		<iconify-icon icon="bi:pause-circle" width="16"></iconify-icon>
		<p class="hidden sm:block text-xs font-bold uppercase">{m.entrylist_multibutton_unpublish()}</p>
	{:else if value === StatusTypes.schedule}
		<iconify-icon icon="bi:clock" width="16"></iconify-icon>
		<p class="hidden sm:block text-xs font-bold uppercase">{m.entrylist_multibutton_schedule()}</p>
	{:else if value === 'deleted'}
		<iconify-icon icon="bi:trash3-fill" width="16"></iconify-icon>
		<p class="hidden sm:block text-xs font-bold uppercase">{m.button_delete()}</p>
	{:else if value === StatusTypes.delete}
		<iconify-icon icon="bi:trash3-fill" width="16"></iconify-icon>
		<p class="hidden sm:block text-xs font-bold uppercase">{m.button_delete()}</p>
	{:else if value === StatusTypes.clone}
		<iconify-icon icon="bi:clipboard-data-fill" width="16"></iconify-icon>
		<p class="hidden sm:block text-xs font-bold uppercase">{m.entrylist_multibutton_clone()}</p>
	{:else if value === StatusTypes.draft}
		<iconify-icon icon="bi:pencil-square" width="16"></iconify-icon>
		<p class="hidden sm:block text-xs font-bold uppercase">{m.entrylist_multibutton_draft()}</p>
	{:else if value === StatusTypes.archive}
		<iconify-icon icon="bi:archive-fill" width="16"></iconify-icon>
		<p class="hidden sm:block text-xs font-bold uppercase">{m.button_archive()}</p>
	{:else}
		<p class="px-2">{value}</p>
	{/if}
</div>
