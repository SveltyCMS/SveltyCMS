<script lang="ts">
	import { mode } from '@src/stores/store';
	import { currentChild } from '.';
	import { contentLanguage } from '@src/stores/store';

	export let self: { [key: string]: any; children: any[] };
	export let level = 0;
	export let depth = 0;
	export let showFields = false;
	export let maxDepth = 0;
	export let isFirstHeader = false;
	export let parent: { [key: string]: any; children: any[] } | null = null;

	let expanded = false;

	export const refresh = () => {
		self.children = [...self.children];
	};
</script>

<button on:click={() => (expanded = !expanded)} class="relative my-2 flex items-center justify-center gap-2" style="margin-left:{20 * level}px">
	{#if !isFirstHeader && self.children?.length > 0}
		<iconify-icon icon="mdi:chevron-down" width="30" class:expanded class=" btn-icon btn-icon-sm bg-error-500" />
	{/if}

	<span class="variant-outline-primary rounded p-2">{self?.Header[$contentLanguage]}</span>

	<!-- {console.log(level, maxDepth)} -->
	{#if level < maxDepth - 1}
		<!-- add  Button children -->
		<button
			on:click|stopPropagation={() => {
				$currentChild = self;
				depth = level + 1;
				showFields = true;
				mode.set('create');
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
			showFields = true;
			//console.log(self);
		}}
		class="variant-ghost-primary btn-icon"
		><iconify-icon icon="mdi:pen" width="28" class="" />
	</button>

	{#if !isFirstHeader && self.children?.length === 0}
		<button
			on:click|stopPropagation={() => {
				parent?.children?.splice(parent?.children?.indexOf(self), 1);
				refresh();
			}}
			class="variant-ghost-error btn-icon"
		>
			<iconify-icon icon="mdi:trash-can-outline" width="24" class="dark:text-white" />
		</button>
	{/if}
</button>

<hr class="my-1 h-px border-0 bg-gray-200 dark:bg-gray-500" />

{#if self.children?.length > 0 && expanded}
	<ul>
		{#each self.children as child}
			<li class="cursor-pointer">
				<svelte:self {refresh} self={child} level={level + 1} bind:depth bind:showFields parent={self} {maxDepth} />
			</li>
		{/each}
	</ul>
{/if}

{#if level == 0 && $mode != 'edit'}
	<!-- Menu Name -->
	<div class="mb-2 border border-x-0 py-2 text-center font-bold text-tertiary-500">Enter your Menu Categories</div>

	<!-- Categories Children-->
	{#if self.children?.length > 0}
		<ul class="relative rounded border p-2">
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
