<script lang="ts">
	import { mode, contentLanguage, shouldShowNextButton } from '@stores/store';
	import { currentChild } from '.';

	let expanded = false;

	export let self: { [key: string]: any; children: any[] };
	export let parent: { [key: string]: any; children: any[] } | null = null;
	export let level = 0;
	export let depth = 0;
	export let showFields = false;
	export let maxDepth = 0;

	export let refresh = () => {
		self.children.length = self.children?.length;
		//console.log('Refreshing:', self);
	};

	console.log('self:', self); // Output self to the console
</script>

<button
	class="header"
	class:!cursor-pointer={self.children?.length > 0}
	style="margin-left:{20 * level}px;
max-width:{window.screen.width <= 700 ? `calc(100% + ${20 * (maxDepth - level)}px)` : `calc(100% - ${20 * level}px)`}"
>
	<!-- Display chevron-down icon for expandable children except the first header -->
	{#if level > 0 && self.children?.length > 0}
		<iconify-icon icon="mdi:chevron-down" width="30" class:expanded class=" btn-icon btn-icon-sm bg-error-500" />
	{/if}

	<span class="variant-outline-primary mr-2 rounded p-2">{self?.Header[$contentLanguage]}</span>

	<!-- Add  Button children -->
	{#if level < maxDepth - 1}
		<button
			on:click|stopPropagation={() => {
				$currentChild = self;
				depth = level + 1;
				showFields = true;
				mode.set('create');
				shouldShowNextButton.set(true);
			}}
			class="variant-ghost-primary btn-icon"
		>
			<iconify-icon icon="icons8:plus" width="28" />
		</button>
	{/if}

	<!-- Edit Button children -->
	<button
		on:click|stopPropagation={() => {
			$currentChild = self;
			$mode = 'edit';
			depth = level;
			//console.log(self);
			showFields = true;
			shouldShowNextButton.set(true);
		}}
		class="variant-ghost-primary btn-icon"
	>
		<iconify-icon icon="mdi:pen" width="28" class="" />
	</button>

	<!-- DeleteIcon -->
	<!-- <TODO: Delete not refreshing correctly -->
	{#if level > 0}
		<button
			on:click|stopPropagation={() => {
				console.log('Deleting:', self);
				console.log('Parent:', parent);
				if (self.children && self.children.length > 0) {
					alert('This term has children. Please delete the children first.');
				} else {
					if (parent) {
						const index = parent.children.indexOf(self);
						if (index !== -1) {
							// Remove the item from the parent's children array
							parent.children = [...parent.children.slice(0, index), ...parent.children.slice(index + 1)];
							console.log('New children array:', parent.children);
							// Trigger refresh
							refresh();
						}
					} else {
						// Handle the case where parent is null
						console.log('Parent is null. Cannot delete item.');
					}
				}
			}}
			class="btn-icon {self.children && self.children.length > 0 ? 'variant-ghost-warning' : 'variant-ghost-error'}"
		>
			{#if self.children && self.children.length > 0}
				<iconify-icon icon="mdi:alert-octagon" width="24" class="text-white" />
			{:else}
				<iconify-icon icon="mdi:trash-can-outline" width="24" class="text-white" />
			{/if}
		</button>
	{/if}
</button>

<!-- Categories Children-->
{#if self.children?.length > 0}
	<ul class="relative p-2">
		{#each self.children as child}
			<li class="cursor-pointer">
				<svelte:self
					self={child}
					level={level + 1}
					bind:depth
					bind:showFields
					{maxDepth}
					on:keydown
					on:click={() => {
						depth = level;
						showFields = true;
					}}
				/>
			</li>
		{/each}
	</ul>
{/if}

<style lang="postcss">
	.header {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 2px;
		border: 1px solid #80808045;
		border-radius: 5px;
		padding: 10px 0px;
		padding-left: 50px;
		padding-right: 10px;
		margin-bottom: 5px;
		width: 100vw;
		min-width: 200px;
		cursor: default;
	}
	.arrow {
		position: absolute;
		left: 10px;
		top: 40%;
		transform: translateY(-50%);
		border: solid black;
		border-width: 0 3px 3px 0;
		display: inline-block;
		padding: 3px;
		transform: rotate(-45deg);
		margin-right: 10px;
		transition: transform 0.1s ease-in;
	}
	.expanded {
		transform: rotate(45deg);
	}
	button:active {
		transform: scale(0.9);
	}
</style>
