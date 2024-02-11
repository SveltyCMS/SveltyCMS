<script lang="ts">
	import { collection, contentLanguage, headerActionButton } from '@src/stores/store';
	import MultiButton from './system/buttons/MultiButton.svelte';
	import { drawerExpanded, mode } from '@src/stores/store';
	import DeleteIcon from './system/icons/DeleteIcon.svelte';
	import DropDown from './system/dropDown/DropDown.svelte';
	$: {
		$headerActionButton = DeleteIcon;
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
			<DropDown class="absolute" items={['en', 'de']} bind:selected={$contentLanguage} />
		</div>
		{#if !['edit', 'create'].includes($mode)}
			<MultiButton />
		{:else}
			<button class="item-center flex justify-center" on:click={() => mode.set('view')}>
				{#if typeof $headerActionButton != 'string'}
					<svelte:component this={$headerActionButton} />
				{:else}
					<iconify-icon width="22" class="p-[10px]" icon={$headerActionButton} />
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
