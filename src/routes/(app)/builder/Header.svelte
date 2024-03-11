<script lang="ts">
	// Stores
	import { collection, contentLanguage, headerActionButton2 } from '@src/stores/store';
	import { drawerExpanded, mode } from '@src/stores/store';

	// Components
	import XIcon from '@src/components/system/icons/XIcon.svelte';
	import DropDown from '@src/components/system/dropDown/DropDown.svelte';
	import MultiButton from '@src/components/system/buttons/MultiButton.svelte';

	$: {
		$headerActionButton2 = XIcon;
		$collection;
	}
</script>

<div class="h-[60px]">
	<div class="wrapper max-md:!fixed max-md:left-0 max-md:top-0">
		<button class="text-white" on:click={() => ($drawerExpanded = !$drawerExpanded)}
			><iconify-icon class="h-[17px] md:hidden" icon="mingcute:menu-fill" width="24" /></button
		>
		<div class="collection mr-auto">
			{$collection?.name}
		</div>
		<div class="relative h-full w-[50px]">
			<DropDown items={['en', 'de']} bind:selected={$contentLanguage} />
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

<style>
	.collection {
		font-size: 22px;
	}

	.wrapper {
		position: relative;
		height: 50px;
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		z-index: 1;
		background-color: #242734;
		color: white;
		margin-bottom: 10px;
		padding: 10px;
	}
</style>
