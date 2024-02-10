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

	// Svelte DND action
	import { flip } from 'svelte/animate';
	import { dndzone } from 'svelte-dnd-action';

	function handleDndConsider(e: any) {
		self.children = e.detail.items;
	}

	function handleDndFinalize(e: any) {
		self.children = e.detail.items;
	}

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

<!-- label boxes -->
<button
	on:click={(e) => {
		if (expanded) {
			recalculateBorderHeight(ul);
		}
		expanded = !expanded;
	}}
	class="header relative mb-2 flex w-screen min-w-[200px] cursor-default items-center justify-start rounded border border-surface-400 px-1"
	class:!cursor-pointer={self.children?.length > 0}
	style="margin-left:{15 * level}px;
	max-width:{window.screen.width <= 700 ? `calc(100% + ${15 * (maxDepth - level)}px)` : `calc(100% - ${15 * level}px)`}"
>
	<!-- ladder dashed vertical -->
	<div class="absolute bottom-6 right-full mr-0.5 border-t border-dashed border-surface-400 dark:border-primary-500" style="width:{15 * level}px" />
	<!-- drag icon -->
	<iconify-icon icon="mdi:drag" width="18" class="cursor-move" />
	<!-- Display chevron-down icon for expandable children except the first header -->
	{#if self.children?.length > 0}
		<iconify-icon icon="mdi:chevron-down" width="30" class="dark:text-primary-500 {expanded === true ? 'rotate-0' : '-rotate-90'}" />
	{:else}
		<!-- TODO: improve indentation -->
		<div class="mr-7" />
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
	<ul bind:this={ul} class="children relative" style="margin-left:{15 * level + 15}px;">
		<!-- dashed ladder horizontal -->
		<div class="absolute -left-0.5 -top-1 max-h-full border border-dashed border-surface-400 content-none dark:border-primary-500" />
		<!-- <section use:dndzone={{ items , flipDurationMs }} on:consider={handleDndConsider} on:finalize={handleDndFinalize}> -->
		{#each self.children as child}
			<li>
				<!-- <div animate:flip={{ duration: flipDurationMs }}>{item.name}</div> -->
				<svelte:self {refresh} self={child} level={level + 1} bind:depth bind:showFields parent={self} {maxDepth} />
			</li>
		{/each}
		<!-- </section> -->
	</ul>
{/if}
