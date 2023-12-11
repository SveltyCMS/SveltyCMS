<script lang="ts">
	// The status value to display
	export let value: string;

	//ParaglideJS
	import * as m from '@src/paraglide/messages';
</script>

<!-- Display different badges for different statuses -->
<span
	class={value === 'published'
		? 'gradient-primary badge rounded'
		: value === 'unpublished'
			? 'gradient-yellow badge rounded'
			: value === 'schedule'
				? 'gradient-pink badge rounded'
				: value === 'clone'
					? 'gradient-secondary badge rounded'
					: value === 'testing'
						? 'gradient-error badge rounded'
						: 'badge rounded text-white'}
>
	{#if value == 'published'}
		<iconify-icon icon="bi:hand-thumbs-up-fill" width="20" class="mr-2" /><span class="status-text hidden md:inline"
			>{m.tanstackstatus_published()}</span
		>
	{:else if value == 'unpublished'}
		<iconify-icon icon="bi:pause-circle" width="20" class="mr-2" /><span class="status-text hidden md:inline">{m.tanstackstatus_unpublished()}</span>
	{:else if value == 'schedule'}
		<iconify-icon icon="bi:clock" width="20" class="mr-2" /><span class="status-text hidden md:inline">{m.tanstackstatus_scheduled()}</span>
	{:else if value == 'clone'}
		<iconify-icon icon="bi:clipboard-data-fill" width="20" class="mr-2" /><span class="status-text hidden md:inline">{m.tanstackstatus_cloned()}</span
		>
	{:else if value == 'testing'}
		<iconify-icon icon="icon-park-outline:preview-open" width="20" class="mr-2" /><span class="status-text hidden md:inline"
			>{m.tanstackstatus_testing()}</span
		>
	{/if}
</span>
