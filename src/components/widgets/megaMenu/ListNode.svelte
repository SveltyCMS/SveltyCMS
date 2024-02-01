<script lang="ts">
	import { mode, contentLanguage, shouldShowNextButton } from '@stores/store';
	import { currentChild } from '.';

	let expanded = false;
	let ul: HTMLElement;

	export let self: { [key: string]: any; children: any[] };
	export let parent: { [key: string]: any; children: any[] } | null = null;
	export let level = 0;
	export let depth = 0;
	export let showFields = false;
	export let maxDepth = 0;

	export let refresh = () => {
		self.children.length = self.children?.length;
	};

	function setBorderHeight(node: HTMLElement | null | undefined) {
		if (!node) return;
		// if (!parent_border || !lastChild || !parent) return;
		setTimeout(async () => {
			let lastHeader = node?.lastChild?.firstChild as HTMLElement;
			if (!lastHeader) return;
			let border = node?.querySelector('.border') as HTMLElement;
			border && (border.style.height = lastHeader.offsetTop + lastHeader.offsetHeight / 2 + 'px');
		}, 0);
	}

	$: if (self.children.length) {
		recalculateBorderHeight(ul);
	}

	function findFirstOuterUl(node: HTMLElement | null) {
		if (!node) return;
		if (node.tagName == 'UL') return node;
		return findFirstOuterUl(node.parentElement);
	}
	function recalculateBorderHeight(node) {
		let child = findFirstOuterUl(node);
		setBorderHeight(child);
		if (!child?.classList.contains('MENU_CONTAINER') && child) {
			recalculateBorderHeight(child?.parentElement);
		}
	}
</script>

<!-- Start of menu -->

<button
	on:click={(e) => {
		if (expanded) {
			recalculateBorderHeight(ul);
		}
		expanded = !expanded;
	}}
	class="relative mb-2 flex w-full min-w-[200px] cursor-default items-center gap-2 rounded border border-surface-400 py-2 pl-2"
	class:!cursor-pointer={self.children?.length > 0}
	style="margin-left:{20 * level}px;

	max-width:{window.screen.width <= 700 ? `calc(100% + ${10 * (maxDepth - level)}px)` : `calc(100% - ${10 * level}px)`}"
>
	<!-- ladder dashes -->
	<div class="ladder" style="width:{10 * level}px" />

	<!-- Display chevron-down icon for expandable children except the first header -->
	{#if self.children?.length > 0}
		<!-- <button class="arrow dark:!border-white" class:expanded /> -->
		<iconify-icon icon="mdi:chevron-down" width="30" class="btn-icon btn-icon-sm text-primary-500 {expanded === true ? 'rotate-0' : '-rotate-90'}" />
	{/if}

	<!-- Label -->
	<span class="">
		{self?.Header[$contentLanguage]}
	</span>

	<!-- Buttons -->
	<div class="ml-auto flex items-center justify-end gap-1">
		<!-- Add Button  -->
		{#if level < maxDepth - 1}
			<button
				on:click|stopPropagation={() => {
					$currentChild = self;
					depth = level + 1;
					showFields = true;
					mode.set('create');
					shouldShowNextButton.set(true);
				}}
				class="btn-icon dark:text-primary-500"
			>
				<iconify-icon icon="icons8:plus" width="30" />
			</button>
		{/if}

		<!-- Edit Button -->
		<button
			on:click|stopPropagation={() => {
				$currentChild = self;
				$mode = 'edit';
				depth = level;
				//console.log(self);
				showFields = true;
				shouldShowNextButton.set(true);
			}}
			class="btn-icon dark:text-primary-500"
		>
			<iconify-icon icon="mdi:pen" width="30" class="" />
		</button>

		<!-- Delete Button -->
		{#if level > 0}
			<button
				on:click|stopPropagation={() => {
					parent?.children?.splice(parent?.children?.indexOf(self), 1);
					refresh();
				}}
			>
				{#if self.children && self.children.length > 0}
					<iconify-icon icon="mdi:alert-octagon" width="30" class="text-warning-500" />
				{:else}
					<iconify-icon icon="mdi:trash-can-outline" width="30" class="text-error-500" />
				{/if}
			</button>
		{/if}
	</div>
</button>

<!-- Categories Children-->
{#if self.children?.length > 0 && expanded}
	<ul bind:this={ul} class="children relative" style="margin-left:{20 * level + 15}px;">
		<div class="border-dash" />
		{#each self.children as child}
			<li>
				<svelte:self {refresh} self={child} level={level + 1} bind:depth bind:showFields parrent={self} {maxDepth} />
			</li>
		{/each}
	</ul>
{/if}

<style lang="postcss">
	.ladder {
		position: absolute;
		height: 0;
		right: 100%;
		border-top: 1px dashed;
	}

	.border-dash {
		content: '';
		position: absolute;
		left: 0;
		width: 0;
		border-left: 1px dashed;
		max-height: 100%;
	}

	ul {
		overflow: visible;
	}
</style>
