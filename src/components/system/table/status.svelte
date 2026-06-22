<!--
@file src\components\system\table\status.svelte
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
	import Badge from '@components/ui/badge.svelte';
	import { StatusTypes } from '@src/content/types';

	const { value } = $props(); // The status value to display

	import {
		button_archive,
		button_delete,
		entrylist_multibutton_clone,
		entrylist_multibutton_draft,
		entrylist_multibutton_publish,
		entrylist_multibutton_schedule,
		entrylist_multibutton_unpublish
	} from '@src/paraglide/messages';

	const badgeConfig = $derived.by(() => {
		switch (value) {
			case StatusTypes.publish:
				return { variant: 'success' as const, icon: 'bi:hand-thumbs-up-fill', label: entrylist_multibutton_publish() };
			case StatusTypes.unpublish:
				return { variant: 'warning' as const, icon: 'bi:pause-circle', label: entrylist_multibutton_unpublish() };
			case StatusTypes.schedule:
				return { variant: 'error' as const, icon: 'bi:clock', label: entrylist_multibutton_schedule() };
			case StatusTypes.delete:
			case 'deleted':
				return { variant: 'surface' as const, icon: 'bi:trash3-fill', label: button_delete() };
			case StatusTypes.clone:
				return { variant: 'secondary' as const, icon: 'bi:clipboard-data-fill', label: entrylist_multibutton_clone() };
			case StatusTypes.draft:
				return { variant: 'outline' as const, icon: 'bi:pencil-square', label: entrylist_multibutton_draft() };
			case StatusTypes.archive:
				return { variant: 'surface' as const, icon: 'bi:archive-fill', label: button_archive() };
			default:
				return null;
		}
	});
</script>

<!-- Display different badges for different statuses -->
{#if badgeConfig}
	<Badge variant={badgeConfig.variant} class="flex w-fit min-w-24 items-center justify-center gap-2 px-3 py-1.5">
		<iconify-icon icon={badgeConfig.icon} width="16"></iconify-icon>
		<span class="hidden sm:inline text-xs font-bold uppercase">{badgeConfig.label}</span>
	</Badge>
{:else}
	<Badge variant="surface" class="px-2">{value}</Badge>
{/if}
