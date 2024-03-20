<script lang="ts">
	// The status value to display
	export let value: string;

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
</script>

<!-- Display different badges for different statuses -->
<div
	class="grid w-full max-w-full grid-cols-1 items-center justify-start text-left sm:grid-cols-2 {value === 'Published'
		? 'gradient-primary badge rounded'
		: value === 'Unpublished'
			? 'gradient-yellow badge rounded'
			: value === 'Schedule'
				? 'gradient-pink badge rounded'
				: value === 'Clone'
					? 'gradient-secondary badge rounded'
					: value === 'Testing'
						? 'gradient-error badge rounded'
						: 'badge rounded  text-center'} "
>
	{#if value == 'Published'}
		<iconify-icon icon="bi:hand-thumbs-up-fill" width="20" class="mx-auto" />
		<p class="hidden sm:block">{m.entrylist_multibutton_publish()}</p>
	{:else if value == 'Unpublished'}
		<iconify-icon icon="bi:pause-circle" width="20" class="mx-auto" />
		<p class="hidden sm:block">{m.entrylist_multibutton_unpublish()}</p>
	{:else if value == 'Schedule'}
		<iconify-icon icon="bi:clock" width="20" class="mx-auto" />
		<p class="hidden sm:block">{m.entrylist_multibutton_schedule()}</p>
	{:else if value == 'Clone'}
		<iconify-icon icon="bi:clipboard-data-fill" width="20" class="mx-auto" />
		<p class="hidden sm:block">{m.entrylist_multibutton_clone()}</p>
	{:else if value == 'Testing'}
		<iconify-icon icon="icon-park-outline:preview-open" width="20" class="mx-auto" />
		<p class="hidden sm:block">{m.entrylist_multibutton_testing()}</p>
	{/if}
</div>
