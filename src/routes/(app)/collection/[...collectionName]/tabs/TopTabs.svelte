<script lang="ts">
	import { tabSet } from '@stores/store';
	import { Tab } from '@skeletonlabs/skeleton';

	import * as m from '@src/paraglide/messages';
</script>

<Tab bind:group={$tabSet} name="tab1" value={0}>
	<div class="flex items-center gap-1">
		<iconify-icon icon="ic:baseline-edit" width="24" class="text-tertiary-500 dark:text-primary-500" />
		<span class:active={$tabSet === 0} class:text-tertiary-500={$tabSet === 0} class:text-primary-500={$tabSet === 0}>{m.collection_edit()}</span>
	</div>
</Tab>
<Tab bind:group={$tabSet} name="tab2" value={1}>
	<div class="flex items-center gap-1">
		<iconify-icon icon="mdi:security-lock" width="24" class="text-tertiary-500 dark:text-primary-500" />
		<span class:active={$tabSet === 1} class:text-tertiary-500={$tabSet === 1} class:dark:text-primary-500={$tabSet === 1}
			>{m.collection_permission()}</span
		>
	</div>
</Tab>
<Tab bind:group={$tabSet} name="tab3" value={2}>
	<div class="flex items-center gap-1">
		<iconify-icon icon="mdi:widgets-outline" width="24" class="text-tertiary-500 dark:text-primary-500" />
		<span class:active={$tabSet === 1} class:text-tertiary-500={$tabSet === 2} class:text-primary-500={$tabSet === 2}
			>{m.collection_widgetfields()}</span
		>
	</div>
</Tab>
