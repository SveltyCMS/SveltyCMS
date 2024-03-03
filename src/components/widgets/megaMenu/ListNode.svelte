<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { CustomDragEvent } from './types';
	import { currentChild } from '.';
	import XIcon from '@src/components/system/icons/XIcon.svelte';
	import { debounce } from '@src/utils/utils';

	// Stores
	import { mode, contentLanguage, shouldShowNextButton, headerActionButton2 } from '@stores/store';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { getModalStore, type ModalSettings } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	let expanded_list: boolean[] = [];
	let ul: HTMLElement;
	let fields_container: HTMLDivElement;

	onMount(() => {
		fields_container = document.getElementById('fields_container') as HTMLDivElement;
	});

	export let self: { [key: string]: any; children: any[] };
	export let parent: { [key: string]: any; children: any[] } | null = null;
	export let level = 0;
	export let depth = 0;
	export let showFields = false;
	export let maxDepth = 0;
	export let expanded = false;
	export let MENU_CONTAINER: HTMLUListElement;

	export let refresh = () => {
		self?.children && (self.children = self.children);
	};

	function setBorderHeight(node: HTMLElement | null | undefined) {
		if (!node) return;

		setTimeout(async () => {
			let lastHeader = node?.lastChild?.firstChild as HTMLElement;
			if (!lastHeader) return;
			let border = node?.querySelector('.border') as HTMLElement;
			border && (border.style.height = lastHeader.offsetTop + lastHeader.offsetHeight / 2 + 'px');
		}, 0);
	}

	$: if (self?.children?.length) {
		recalculateBorderHeight();
		ul;
	}
	$: if (showFields) {
		$headerActionButton2 = XIcon;
	}

	function recalculateBorderHeight() {
		MENU_CONTAINER &&
			MENU_CONTAINER.querySelectorAll('ul').forEach((el) => {
				setBorderHeight(el);
			});
	}

	function notifyChildren(node: HTMLElement) {
		node.addEventListener('custom:notifyChildren', (e) => {
			let details = (e as any).detail as { clone_isExpanded: boolean };
			expanded_list.push(details.clone_isExpanded);
			expanded_list = expanded_list;
		});
	}

	function handleDelete() {
		if (self.children && self.children.length > 0) {
			// Show warning modal
			const warningModal: ModalSettings = {
				type: 'confirm',
				title: 'Warning!',
				body: m.Listnode_confirm_body(),
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
				body: m.Listnode_confirm_body(),
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
	function drag(node: HTMLElement) {
		node.addEventListener('custom:drag', async (e) => {
			let event = e as CustomDragEvent;
			let clone_isExpanded = event.detail.expanded_list.splice(event.detail.clone_index, 1)[0];
			if (event.detail.isParent) {
				self.children[event.detail.closest_index].children.push(event.detail.dragged_item);
				await tick();

				node.firstChild?.dispatchEvent(
					new CustomEvent('custom:notifyChildren', {
						detail: {
							clone_isExpanded
						}
					})
				);
			} else {
				// let isSameParent = self.children.indexOf(event.detail.children[event.detail.clone_index]) !== -1;

				self?.children?.splice(event.detail.closest_index, 0, event.detail.dragged_item);
				expanded_list.splice(event.detail.closest_index, 0, clone_isExpanded);
				expanded_list = expanded_list;
			}
			event.detail.refresh_expanded_list();
			refresh();
		});

		node.onpointerdown = (e) => {
			e.stopPropagation();
			let node = e.currentTarget as HTMLElement;
			let pointerID = e.pointerId;

			node.onpointerleave = node.onpointerup = (e) => {
				clearTimeout(timeout);
			};

			let timeout = setTimeout(() => {
				node.style.opacity = '0.5';

				let clone = node.cloneNode(true) as HTMLElement;
				MENU_CONTAINER.appendChild(clone);
				clone.style.left = node.getBoundingClientRect().left + 'px';
				clone.style.marginLeft = '0';
				clone.style.position = 'fixed';
				clone.style.top = e.clientY + 'px';
				clone.style.width = node.offsetWidth + 'px';
				clone.setPointerCapture(pointerID);
				let cloneHeight = clone.offsetHeight + 10 + 'px';
				let targets: any = [];
				let deb = debounce(3);
				let old_closest: HTMLElement;
				clone.onpointermove = (e) => {
					if (e.clientY < fields_container.offsetTop || e.clientY > fields_container.offsetTop + fields_container.offsetHeight - 60) {
						if (e.clientY < fields_container.offsetTop) {
							fields_container.scrollBy(0, -5);
						} else {
							fields_container.scrollBy(0, 5);
						}
					}
					clone.style.top = e.clientY + 'px';
					clone.style.opacity = '1';
					deb(() => {
						let siblings = [...document.getElementsByClassName(`level-${level}`)]
							.map((el) => {
								let rect = el.getElementsByClassName('header')[0].getBoundingClientRect();
								return { el: el as HTMLElement, center: rect.top + rect.height / 2, isParent: false };
							})
							.filter((el) => el.el != clone);
						let parents = [...document.getElementsByClassName(`level-${level - 1}`)]
							.filter((el) => parseInt(el.getAttribute('data-children') as string) == 0)
							.map((el) => {
								let rect = el.getElementsByClassName('header')[0].getBoundingClientRect();
								return { el: el as HTMLElement, center: rect.top + rect.height / 2, isParent: true };
							});
						targets = [...siblings, ...parents];
						targets.sort((a, b) => (Math.abs(b.center - e.clientY) < Math.abs(a.center - e.clientY) ? 1 : -1));
						let closest = targets[0];

						if (old_closest) {
							old_closest.firstChild && ((old_closest.firstChild as HTMLElement).style.borderColor = '#80808045');
							old_closest.style.padding = '0';
						}

						if (closest.el == node) return;
						let closest_index = parseInt(closest.el.getAttribute('data-index') as string);
						let clone_index = parseInt(clone.getAttribute('data-index') as string);

						if (e.clientY > closest.center && clone_index - closest_index != 1 && !closest.isParent) {
							closest.el.style.paddingBottom = cloneHeight;
						} else if (e.clientY < closest.center && !closest.isParent && closest_index - clone_index != 1) {
							closest.el.style.paddingTop = cloneHeight;
						}
						closest.el.firstChild && ((closest.el.firstChild as HTMLElement).style.borderColor = closest.isParent ? 'red' : 'green');
						recalculateBorderHeight();
						setTimeout(() => {
							recalculateBorderHeight();
						}, 110);
						old_closest = closest.el;
					});
				};

				clone.onpointerup = async (e) => {
					clone.releasePointerCapture(pointerID);
					clone.remove();

					setTimeout(() => {
						targets.forEach((el) => {
							el.el.firstChild && ((el.el.firstChild as HTMLElement).style.borderColor = '#80808045');
							el.el.style.padding = '0';
						});
					}, 50);

					node.style.opacity = '1';
					targets.sort((a, b) => (Math.abs(b.center - e.clientY) < Math.abs(a.center - e.clientY) ? 1 : -1));
					let closest = targets[0];

					if (closest.el == node) return;

					let closest_index = parseInt(closest.el.getAttribute('data-index') as string);
					let clone_index = parseInt(clone.getAttribute('data-index') as string);
					let dragged_item = self.children.splice(clone_index, 1)[0];
					if (clone_index < closest_index && !closest.isParent) {
						closest_index--;
					}
					closest.el.dispatchEvent(
						new CustomEvent('custom:drag', {
							detail: {
								closest_index: closest.isParent ? closest_index : e.clientY < closest.center ? closest_index : closest_index + 1,
								clone_index,
								isParent: closest.isParent,
								expanded_list,
								dragged_item,
								refresh_expanded_list: () => (expanded_list = expanded_list)
							}
						})
					);
					refresh();
					setTimeout(() => {
						recalculateBorderHeight();
					}, 120);
				};
			}, 200);
		};
	}
</script>

<!-- label boxes -->
<button
	use:notifyChildren
	on:click={(e) => {
		if (expanded) {
			recalculateBorderHeight();
		}
		expanded = !expanded;
	}}
	class="header header-level-{level} relative mb-2 flex w-full min-w-[200px] max-w-[300px] cursor-default items-center justify-start gap-2 rounded border border-surface-300 px-1"
	class:!cursor-pointer={self?.children?.length > 0}
	style="margin-left:{10 * (level > 0 ? 1 : 0)}px;
	{window.screen.width <= 700
		? `min-width:calc(100% + ${10 * (maxDepth * maxDepth - (level > 0 ? 1 : 0))}px)`
		: `max-width:calc(100% - ${10 * (level > 0 ? 1 : 0)}px)`}"
>
	<!-- ladder dashed vertical -->
	<div
		class="absolute bottom-6 right-full mr-0.5 border-t border-dashed border-tertiary-500 dark:border-primary-500"
		style="width:{10 * (level > 0 ? 1 : 0)}px"
	/>

	<!-- Drag icon -->
	{#if level > 0}
		<iconify-icon icon="mdi:drag" width="18" class="cursor-move" />
	{/if}

	<!-- Display chevron-down icon for expandable children except the first header -->
	{#if self?.children?.length > 0}
		<iconify-icon
			icon="mdi:chevron-down"
			width="30"
			class="text-tertiary-500 dark:text-primary-500 {expanded === true ? 'rotate-0' : '-rotate-90'}"
		/>
	{:else}
		<!-- TODO: improve indentation -->
		<div class="mr-7" />
	{/if}

	<!-- Label -->
	<span class="max-w-150px text-wrap font-bold sm:max-w-full">
		{self?.Header[$contentLanguage]}
	</span>

	<!-- Buttons  -->
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
				<iconify-icon icon="icons8:plus" width="30" class="text-tertiary-500 dark:text-primary-500" />
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
			<iconify-icon icon="raphael:edit" width="28" class="text-tertiary-500 dark:text-primary-500" />
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
{#if self?.children?.length > 0 && expanded}
	<ul bind:this={ul} class="children user-select-none relative overflow-visible" style="margin-left:{10 * (level > 0 ? 1 : 0) + 10}px;">
		<!-- dashed ladder horizontal -->
		<div class="absolute -left-0.5 -top-1 max-h-full border border-dashed border-tertiary-500 content-none dark:border-primary-500" />

		{#each self.children as child, index}
			<li use:drag data-children={expanded_list[index] ? child.children?.length : 0} data-index={index} class={`level-${level} touch-none`}>
				<svelte:self
					{MENU_CONTAINER}
					{refresh}
					self={child}
					level={level + 1}
					bind:depth
					bind:showFields
					parent={self}
					{maxDepth}
					bind:expanded={expanded_list[index]}
				/>
			</li>
		{/each}
	</ul>
{/if}
