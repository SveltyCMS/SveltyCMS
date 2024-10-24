<!-- 
@file src/components/system/table/Status.svelte
@description Status component for table 
-->

<script lang="ts">
	// The status value to display
	export let value: string;

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
</script>

<!-- Display different badges for different statuses -->
<div
	class=" grid w-full max-w-full grid-cols-1 items-center justify-start overflow-hidden rounded py-1.5 text-left sm:grid-cols-2
		{value.toUpperCase() === 'PUBLISHED'
		? 'gradient-primary'
		: value.toUpperCase() === 'UNPUBLISHED'
			? 'gradient-yellow'
			: value.toUpperCase() === 'SCHEDULE'
				? 'gradient-pink'
				: value.toUpperCase() === 'CLONE'
					? 'gradient-secondary'
					: value.toUpperCase() === 'TESTING'
						? 'gradient-error'
						: 'badge'} rounded text-center"
>
	{#if value.toUpperCase() == 'PUBLISHED'}
		<iconify-icon icon="bi:hand-thumbs-up-fill" width="20" class=" mx-auto" />
		<p class="hidden sm:block">{m.entrylist_multibutton_publish()}</p>
	{:else if value.toUpperCase() == 'UNPUBLISHED'}
		<iconify-icon icon="bi:pause-circle" width="20" class="mx-auto" />
		<p class="hidden sm:block">{m.entrylist_multibutton_unpublish()}</p>
	{:else if value.toUpperCase() == 'SCHEDULE'}
		<iconify-icon icon="bi:clock" width="20" class="mx-auto" />
		<p class="hidden sm:block">{m.entrylist_multibutton_schedule()}</p>
	{:else if value.toUpperCase() == 'CLONE'}
		<iconify-icon icon="bi:clipboard-data-fill" width="20" class="mx-auto" />
		<p class="hidden sm:block">{m.entrylist_multibutton_clone()}</p>
	{:else if value.toUpperCase() == 'TESTING'}
		<iconify-icon icon="icon-park-outline:preview-open" width="20" class="mx-auto" />
		<p class="hidden sm:block">{m.entrylist_multibutton_testing()}</p>
	{/if}
</div>
