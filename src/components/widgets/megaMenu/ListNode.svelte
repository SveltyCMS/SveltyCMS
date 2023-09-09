<script lang="ts">
	import { mode } from '@src/stores/store';
	import { currentChild } from '.';
	import { contentLanguage } from '@src/stores/store';

	export let self: { [key: string]: any; children: any[] };
	export let level = 0;
	export let depth = 0;
	export let showFields = false;
	export let maxDepth = 0;

	let expanded = false;
</script>

<button
	on:click={() => (expanded = !expanded)}
	class="relative flex items-center justify-center gap-2"
	style="margin-left:{20 * level}px"
>
	{#if self.children?.length > 0}
		<iconify-icon
			icon="mdi:chevron-down"
			width="30"
			class:expanded
			class=" btn-icon btn-icon-sm bg-red-500"
		/>
	{/if}

	{self?.Header[$contentLanguage]}

	<!-- {console.log(level, maxDepth)} -->
	{#if level < maxDepth - 1}
		<!-- add  Button children -->
		<button
			on:click={() => {
				$currentChild = self;
				depth = level + 1;
				showFields = true;
				mode.set('create');
			}}
			class="variant-filled-primary btn-icon"
		>
			<iconify-icon icon="icons8:plus" width="28" />
		</button>
	{/if}
	<!-- Edit Button children -->
	<button
		on:click={() => {
			$currentChild = self;
			$mode = 'edit';
			depth = level;
			showFields = true;
			//console.log(self);
		}}
		class="variant-filled-surface btn-icon {level == 0 ? 'ml-auto' : ''}"
		><iconify-icon icon="mdi:pen" width="28" class="" />
	</button>
</button>

{#if self.children?.length > 0 && expanded}
	<ul>
		{#each self.children as child}
			<li class="cursor-pointer">
				<svelte:self
					self={child}
					level={level + 1}
					bind:depth
					bind:showFields
					{maxDepth}
					on:click={() => {
						depth = level;
						showFields = true;
					}}
				/>
			</li>
		{/each}
	</ul>
{/if}

{#if level == 0 && $mode != 'edit'}
	<div class="mb-2 border border-x-0 py-2 text-center font-bold">Menu Name</div>

	<div class="flex items-center gap-2">
		<!-- Menu Name -->
		<button
			on:click={() => {
				$currentChild = self;
				$mode = 'edit';
				depth = level;
				//console.log(self);
				showFields = true;
			}}
			class="input p-2"
		>
			{self?.Header[$contentLanguage]}
		</button>

		<!-- Edit Button -->
		<button
			type="button"
			on:click={() => {
				$currentChild = self;
				$mode = 'edit';
				depth = level;
				//console.log(self);
				showFields = true;
			}}
			class="btn-icon variant-soft-tertiary{level == 0 ? 'ml-auto' : ''}"
		>
			<iconify-icon icon="mdi:pen" width="28" />
		</button>
	</div>

	<div class="mb-2 border border-x-0 py-2 text-center font-bold">Enter your Menu Categories</div>

	<!-- Categories Parent-->
	{#if level < maxDepth - 1}
		<button
			type="button"
			on:click={() => {
				$currentChild = self;
				depth = level + 1;
				showFields = true;
				mode.set('create');
			}}
			class="variant-filled-primary btn mb-2 gap-2 font-bold !text-white"
			>Add new Category

			<iconify-icon icon="icons8:plus" width="28" />
		</button>
	{/if}

	<!-- Categories Children-->
	<!-- {#if self.children?.length > 0 && expanded} -->
	{#if self.children?.length > 0}
		<ul class="relative border p-2">
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
{/if}

<style lang="postcss">
	.expanded {
		transform: rotate(-90deg);
	}
</style>
