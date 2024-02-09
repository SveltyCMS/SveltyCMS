<script lang="ts">
	// Stores
	import { mode, contentLanguage, shouldShowNextButton } from '@stores/store';
	import { currentChild } from '.';

	// Skeleton
	import { getModalStore, type ModalSettings } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

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

		// Get the last header element inside the node
		const lastHeader = node.lastChild?.firstChild as HTMLElement;
		if (!lastHeader) return;

		// Get the height of the last header element
		const headerHeight = lastHeader.offsetHeight;

		// Add the appropriate Tailwind CSS class to the border element
		const border = node.querySelector('.border') as HTMLElement;
		if (border) {
			border.classList.add(`h-${headerHeight}`);
		}
	}

	$: if (self.children.length) {
		recalculateBorderHeight(ul);
	}

	function findFirstOuterUl(node: HTMLElement | null) {
		if (!node) return;
		if (node.tagName == 'UL') return node;
		return findFirstOuterUl(node.parentElement);
	}

	function recalculateBorderHeight(node: any) {
		let child = findFirstOuterUl(node);
		setBorderHeight(child);
		if (!child?.classList.contains('MENU_CONTAINER') && child) {
			recalculateBorderHeight(child?.parentElement);
		}
	}

	function handleDelete() {
		if (self.children && self.children.length > 0) {
			// Show warning modal
			const warningModal: ModalSettings = {
				type: 'confirm',
				title: 'Warning!',
				body: 'Deleting this category will also delete all its children. <br>Are you sure you want to proceed?',
				response: (response) => {
					if (response) {
						performDelete();
					}
				}
			};
			modalStore.trigger(warningModal);
		} else {
			// Show confirmation modal directly
			const confirmModal: ModalSettings = {
				type: 'confirm',
				title: 'Confirm Deletion',
				body: 'Are you sure you want to delete this category?',
				response: (response) => {
					if (response) {
						performDelete();
					}
				}
			};
			modalStore.trigger(confirmModal);
		}
	}

	function performDelete() {
		parent?.children?.splice(parent?.children?.indexOf(self), 1);
		refresh();
	}
</script>

<!-- label boxes-->
<button
	on:click={(e) => {
		if (expanded) {
			recalculateBorderHeight(ul);
		}
		expanded = !expanded;
	}}
	class="relative mb-2 flex w-full min-w-[200px] cursor-default items-center gap-2 rounded border border-surface-400 pl-2"
	class:!cursor-pointer={self.children?.length > 0}
	style="margin-left:{10 * level}px;

  max-width:{window.screen.width <= 700 ? `calc(100% + ${10 * (maxDepth - level)}px)` : `calc(100% - ${10 * level}px)`}"
>
	<!-- ladder dashed vertical -->

	<div class="absolute bottom-6 right-full mr-0.5 border-t-2 border-dashed border-surface-400 dark:border-primary-500" style="width:{10 * level}px" />

	<!-- Display chevron-down icon for expandable children except the first header -->
	{#if self.children?.length > 0}
		<iconify-icon
			icon="mdi:chevron-down"
			width="30"
			class="btn-icon btn-icon-sm dark:text-primary-500 {expanded === true ? 'rotate-0' : '-rotate-90'}"
		/>
	{/if}

	<!-- Label -->
	<span class="font-bold">
		{self?.Header[$contentLanguage]}
	</span>

	<!-- Buttons -->
	<div class="ml-auto flex items-center justify-end">
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
			<iconify-icon icon="mdi:pen" width="28" class="" />
		</button>

		<!-- Delete Button -->
		{#if level > 0}
			<button
				class="btn-icon"
				on:click|stopPropagation={() => {
					handleDelete();
				}}
			>
				{#if self.children && self.children.length > 0}
					<iconify-icon icon="mdi:alert-octagon" width="30" class="text-warning-500" />
				{:else}
					<iconify-icon icon="mdi:trash-can-outline" width="30" class="text-error-500" />
				{/if}
			</button>
		{:else}
			<div class="btn-icon"></div>
		{/if}
	</div>
</button>

<!-- Categories Children-->
{#if self.children?.length > 0 && expanded}
	<ul bind:this={ul} class="children relative" style="margin-left:{10 * level + 5}px;">
		<!-- dashed ladder horizontal -->
		<div class="absolute -left-0.5 -top-1 h-1/2 border-l-2 border-dashed border-surface-400 dark:border-primary-500"></div>

		{#each self.children as child}
			<li>
				<svelte:self {refresh} self={child} level={level + 1} bind:depth bind:showFields parent={self} {maxDepth} />
			</li>
		{/each}
	</ul>
{/if}

<style lang="postcss">
	ul {
		overflow: visible;
	}
</style>
