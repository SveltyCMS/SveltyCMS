<script lang="ts">
	// Stores
	import { page } from '$app/stores';
	import { tabSet } from '@stores/store';

	// Auth
	import type { User } from '@src/auth/types';
	const user: User = $page.data.user;

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { Tab } from '@skeletonlabs/skeleton';
</script>

<!-- User Permissions -->
{#if user.role === 'admin'}
	<!-- Edit -->
	<Tab bind:group={$tabSet} name="default" value={0}>
		<div class="flex items-center gap-1">
			<iconify-icon icon="ic:baseline-edit" width="24" class="text-tertiary-500 dark:text-primary-500" />
			<span class:active={$tabSet === 0} class:text-tertiary-500={$tabSet === 0} class:text-primary-500={$tabSet === 0}>{m.button_edit()}</span>
		</div>
	</Tab>
	<!-- Permissions -->
	<Tab bind:group={$tabSet} name="permission" value={1}>
		<div class="flex items-center gap-1">
			<iconify-icon icon="mdi:security-lock" width="24" class="text-tertiary-500 dark:text-primary-500" />
			<span class:active={$tabSet === 1} class:text-tertiary-500={$tabSet === 1} class:dark:text-primary-500={$tabSet === 1}
				>{m.collection_permission()}</span
			>
		</div>
	</Tab>
	<!-- Widget Fields -->
	<Tab bind:group={$tabSet} name="widget" value={2}>
		<div class="flex items-center gap-1">
			<iconify-icon icon="mdi:widgets-outline" width="24" class="text-tertiary-500 dark:text-primary-500" />
			<span class:active={$tabSet === 1} class:text-tertiary-500={$tabSet === 2} class:text-primary-500={$tabSet === 2}
				>{m.collection_widgetfields()}</span
			>
		</div>
	</Tab>
{/if}
