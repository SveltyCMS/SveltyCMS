<script lang="ts">
	import { collection, contentLanguage, headerActionButton2 } from '@src/stores/store';
	import MultiButton from './system/buttons/MultiButton.svelte';
	import { drawerExpanded, mode } from '@src/stores/store';

	// Components
	import XIcon from './system/icons/XIcon.svelte';
	import DropDown from './system/dropDown/DropDown.svelte';

	$: {
		$headerActionButton2 = XIcon;
		$collection;
	}
</script>

<div class="h-[60px]">
	<div
		class="color-white relative z-10 mb-2 flex h-12 w-full items-center justify-between bg-surface-800 p-2 max-md:!fixed max-md:left-0 max-md:top-0"
	>
		<button class="text-white" on:click={() => ($drawerExpanded = !$drawerExpanded)}
			><iconify-icon class="h-[17px] md:hidden" icon="mingcute:menu-fill" width="24" /></button
		>
		<div class="mr-auto text-xl">
			{$collection?.name}
		</div>
		<div class="relative h-full w-[50px]">
			<DropDown class="absolute" items={['en', 'de']} bind:selected={$contentLanguage} />
		</div>
		{#if !['edit', 'create'].includes($mode)}
			<MultiButton />
		{:else}
			<button class="item-center flex justify-center" on:click={() => mode.set('view')}>
				{#if typeof $headerActionButton2 != 'string'}
					<svelte:component this={$headerActionButton2} />
				{:else}
					<iconify-icon width="22" class="p-[10px]" icon={$headerActionButton2} />
				{/if}
			</button>
		{/if}
	</div>
</div>
