<script lang="ts">
	// The status value to display
	export let value: string;

	//ParaglideJS
	import * as m from '@src/paraglide/messages';
</script>

<!-- Display different badges for different statuses -->

<div
	class="grid w-full max-w-[200px] grid-cols-1 items-center justify-center text-left sm:grid-cols-2 {value === 'published'
		? 'gradient-primary badge rounded'
		: value === 'unpublished'
			? 'gradient-yellow badge rounded'
			: value === 'schedule'
				? 'gradient-pink badge rounded'
				: value === 'clone'
					? 'gradient-secondary badge rounded'
					: value === 'testing'
						? 'gradient-error badge rounded'
						: 'badge rounded  text-center'} "
>
	{#if value == 'published'}
		<iconify-icon icon="bi:hand-thumbs-up-fill" width="20" class="mx-auto" />
		<p class="hidden sm:block">{m.entrylist_multibutton_publish()}</p>
	{:else if value == 'unpublished'}
		<iconify-icon icon="bi:pause-circle" width="20" class="mx-auto" />
		<p class="hidden sm:block">{m.entrylist_multibutton_unpublish()}</p>
	{:else if value == 'schedule'}
		<iconify-icon icon="bi:clock" width="20" class="mx-auto" />
		<p class="hidden sm:block">{m.entrylist_multibutton_schedule()}</p>
	{:else if value == 'clone'}
		<iconify-icon icon="bi:clipboard-data-fill" width="20" class="mx-auto" />
		<p class="hidden sm:block">{m.entrylist_multibutton_clone()}</p>
	{:else if value == 'testing'}
		<iconify-icon icon="icon-park-outline:preview-open" width="20" class="mx-auto" />
		<p class="hidden sm:block">{m.entrylist_multibutton_testing()}</p>
	{/if}
</div>
