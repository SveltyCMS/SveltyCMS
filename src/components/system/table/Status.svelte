<!-- 
@file src/components/system/table/Status.svelte
@component
**Status component for table displaying different badges for different statuses.**

Value can be: published, unpublished, schedule, clone, testing
```tsx
<Status value="published" />
```
@props
- `value` {string}: The status value to display
-->

<script lang="ts">
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	let { value } = $props<{
		value: string; // The status value to display
	}>();
</script>

<!-- Display different badges for different statuses -->
{value}
<div
	class="grid w-full max-w-full grid-cols-1 items-center justify-start overflow-hidden rounded py-1.5 text-left sm:grid-cols-2
		{value === 'published'
		? 'gradient-primary'
		: value === 'unpublished'
			? 'gradient-yellow'
			: value === 'schedule'
				? 'gradient-pink'
				: value === 'clone'
					? 'gradient-secondary'
					: value === 'testing'
						? 'gradient-error'
						: 'badge'} rounded-sm text-center"
>
	{#if value == 'published'}
		<iconify-icon icon="bi:hand-thumbs-up-fill" width="20" class="mx-auto"></iconify-icon>
		<p class="hidden sm:block">{m.entrylist_multibutton_publish()}</p>
	{:else if value == 'unpublished'}
		<iconify-icon icon="bi:pause-circle" width="20" class="mx-auto"></iconify-icon>
		<p class="hidden sm:block">{m.entrylist_multibutton_unpublish()}</p>
	{:else if value == 'schedule'}
		<iconify-icon icon="bi:clock" width="20" class="mx-auto"></iconify-icon>
		<p class="hidden sm:block">{m.entrylist_multibutton_schedule()}</p>
	{:else if value == 'clone'}
		<iconify-icon icon="bi:clipboard-data-fill" width="20" class="mx-auto"></iconify-icon>
		<p class="hidden sm:block">{m.entrylist_multibutton_clone()}</p>
	{:else if value == 'testing'}
		<iconify-icon icon="icon-park-outline:preview-open" width="20" class="mx-auto"></iconify-icon>
		<p class="hidden sm:block">{m.entrylist_multibutton_testing()}</p>
	{/if}
</div>
