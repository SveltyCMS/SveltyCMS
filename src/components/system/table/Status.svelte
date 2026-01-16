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
	class="grid w-full max-w-96 grid-cols-1 items-center justify-center overflow-hidden rounded py-1.5 text-left text-white sm:grid-cols-2
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
						: value === StatusTypes.test
							? 'gradient-error'
							: value === StatusTypes.draft
								? 'preset-ghost text-surface-950-50'
								: value === StatusTypes.archive
									? 'bg-surface-600 text-white'
									: 'badge'}"
	title={`Status: ${value}`}
>
	{#if value === StatusTypes.publish}
		<iconify-icon icon="bi:hand-thumbs-up-fill" width="20" class="mx-auto"></iconify-icon>
		<p class="hidden sm:block">{m.entrylist_multibutton_publish()}</p>
	{:else if value === StatusTypes.unpublish}
		<iconify-icon icon="bi:pause-circle" width="20" class="mx-auto"></iconify-icon>
		<p class="hidden sm:block">{m.entrylist_multibutton_unpublish()}</p>
	{:else if value === StatusTypes.schedule}
		<iconify-icon icon="bi:clock" width="20" class="mx-auto"></iconify-icon>
		<p class="hidden sm:block">{m.entrylist_multibutton_schedule()}</p>
	{:else if value === 'deleted'}
		<iconify-icon icon="bi:trash3-fill" width="20" class="mx-auto"></iconify-icon>
		<p class="hidden sm:block">{m.button_delete()}</p>
	{:else if value === StatusTypes.delete}
		<iconify-icon icon="bi:trash3-fill" width="20" class="mx-auto"></iconify-icon>
		<p class="hidden sm:block">{m.button_delete()}</p>
	{:else if value === StatusTypes.clone}
		<iconify-icon icon="bi:clipboard-data-fill" width="20" class="mx-auto"></iconify-icon>
		<p class="hidden sm:block">{m.entrylist_multibutton_clone()}</p>
	{:else if value === StatusTypes.test}
		<iconify-icon icon="icon-park-outline:preview-open" width="20" class="mx-auto"></iconify-icon>
		<p class="hidden sm:block">{m.entrylist_multibutton_testing()}</p>
	{:else if value === StatusTypes.draft}
		<iconify-icon icon="bi:pencil-square" width="20" class="mx-auto"></iconify-icon>
		<p class="hidden sm:block">{m.entrylist_multibutton_draft()}</p>
	{:else if value === StatusTypes.archive}
		<iconify-icon icon="bi:archive-fill" width="20" class="mx-auto"></iconify-icon>
		<p class="hidden sm:block">{m.button_archive()}</p>
	{:else}
		<p class="col-span-2">{value}</p>
	{/if}
</div>
