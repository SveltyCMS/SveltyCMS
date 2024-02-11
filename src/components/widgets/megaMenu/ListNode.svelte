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

	//DND action
	function drag(e) {
		e.stopPropagation();
		let node = e.currentTarget as HTMLElement;

		let siblings = [...ul.children].slice(1).map((el) => ({ el: el as HTMLElement, top: el.getBoundingClientRect().top }));
		node.onpointermove = (e) => {
			node.onpointermove = null;
			node.style.opacity = '0.5';
			let clone = node.cloneNode(true) as HTMLElement;
			ul.appendChild(clone);
			clone.style.left = node.getBoundingClientRect().left + 'px';
			clone.style.marginLeft = '0';
			clone.style.position = 'fixed';
			clone.style.top = e.clientY + 'px';
			clone.setPointerCapture(e.pointerId);
			clone.onpointermove = (e) => {
				clone.style.top = e.clientY + 'px';
				clone.style.opacity = '1';
			};
			clone.onpointerup = (e) => {
				clone.remove();
				node.style.opacity = '1';
				siblings.sort((a, b) => (Math.abs(b.top - e.clientY) < Math.abs(a.top - e.clientY) ? 1 : -1));
				let closest = siblings[0];
				console.log(siblings);
				console.log(e.clientY, closest.el);
				if (e.clientY > closest.top + closest.el.offsetHeight / 2) {
					closest.el.nextElementSibling ? ul.insertBefore(node, closest.el.nextElementSibling) : ul.appendChild(node);
					node.onpointerdown = drag;
				} else {
					ul.insertBefore(node, closest.el);
				}
			};
		};
		node.onpointerup = (e) => {
			node.onpointermove = null;
		};
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
	style="margin-left:{10 * (level > 0 ? 1 : 0)}px;
	{window.screen.width <= 700
		? `min-width:calc(100% + ${10 * (maxDepth * maxDepth - level)}px)`
		: `max-width:calc(100% - ${10 * (level > 0 ? 1 : 0)}px)`}"
>
	<!-- ladder dashed vertical -->
	<div
		class="absolute bottom-6 right-full mr-0.5 border-t border-dashed border-surface-400 dark:border-primary-500"
		style="width:{10 * (level > 0 ? 1 : 0)}px"
	/>
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
	<span class="max-w-150px text-wrap font-bold sm:max-w-full">
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
			<div class="btn-icon" />
		{/if}
	</div>
</button>

<!-- Categories Children-->
{#if self.children?.length > 0 && expanded}
	<ul bind:this={ul} class="children user-select-none relative overflow-visible" style="margin-left:{10 * (level > 0 ? 1 : 0) + 10}px;">
		<!-- dashed ladder horizontal -->
		<div class="absolute -left-0.5 -top-1 max-h-full border border-dashed border-surface-400 content-none dark:border-primary-500" />

		{#each self.children as child}
			<li on:pointerdown={drag}>
				<svelte:self {refresh} self={child} level={level + 1} bind:depth bind:showFields parent={self} {maxDepth} />
			</li>
		{/each}
	</ul>
{/if}
