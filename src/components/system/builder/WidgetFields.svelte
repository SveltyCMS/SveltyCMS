<!-- 
@file src/components/system/builder/WidgetFields.svelte
@component
**Component for displaying and managing widget fields**

### Features
- Drag and drop fields
- Edit fields
- Delete fields

### Props
- fields: Array of widget fields
- onFieldsUpdate: Function to update fields

### Events
- onFieldsUpdate: Function to update fields

### Stores
- uiStateManager: Store for UI state

### Components
- AddWidget: Component for adding widgets
-->

<script lang="ts">
	//Stores
	import { uiStateManager } from '@root/src/stores/UIStore.svelte';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import AddWidget from './AddWidget.svelte';

	import { debounce } from '@utils/utils';
	import type { FieldInstance } from '@content/types';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Props
	const { fields = [], onFieldsUpdate = () => {} } = $props();

	// State
	let container: HTMLDivElement | null = $state(null);
	let currentFieldKey: string | null = $state(null);
	let currentField: FieldInstance | null = $state(null);

	function initDragAndDrop(node: HTMLElement) {
		function drag(e: PointerEvent) {
			let timeOut: ReturnType<typeof setTimeout> | undefined;
			const pointerID = e.pointerId;

			let targets = $state(
				[...container!.getElementsByClassName('field')].map((el) => {
					const rect = el.getBoundingClientRect();
					return { el: el as HTMLElement, center: rect.top + rect.height / 2 };
				})
			);

			const onPointerUp = () => {
				clearTimeout(timeOut);
			};

			node.onpointerup = onPointerUp;
			node.onpointerleave = onPointerUp;

			timeOut = setTimeout(() => {
				const clone = node.cloneNode(true) as HTMLElement;
				container!.appendChild(clone);
				clone.setPointerCapture(pointerID);
				node.style.opacity = '0.5';
				clone.style.left = node.getBoundingClientRect().left + 'px';
				clone.style.marginLeft = '0';
				clone.style.position = 'fixed';
				clone.style.top = e.clientY + 'px';
				clone.style.width = node.getBoundingClientRect().width + 'px';
				const cloneHeight = clone.offsetHeight + 10 + 'px';
				const deb = debounce(50);
				let old_closest: HTMLElement;

				clone.onpointermove = (e) => {
					if (e.clientY < container!.offsetTop || e.clientY > container!.offsetTop + container!.offsetHeight - 60) {
						if (e.clientY < container!.offsetTop) {
							container!.scrollBy(0, -5);
						} else {
							container!.scrollBy(0, 5);
						}
					}
					clone.style.top = e.clientY + 'px';
					deb(() => {
						targets = [...container!.getElementsByClassName('field')]
							.map((el) => {
								const rect = el.getBoundingClientRect();
								return { el: el as HTMLElement, center: rect.top + rect.height / 2 };
							})
							.filter((el) => el.el != clone);
						targets.sort((a, b) => (Math.abs(b.center - e.clientY) < Math.abs(a.center - e.clientY) ? 1 : -1));
						const closest = targets[0];
						if (closest.el == node) return;
						const closest_index = parseInt(closest.el.getAttribute('data-index') as string);
						const clone_index = parseInt(clone.getAttribute('data-index') as string);

						if (old_closest) {
							old_closest.style.removeProperty('border-color');
							old_closest.style.margin = '10px 0';
						}
						if (e.clientY > closest.center && clone_index - closest_index != 1) {
							closest.el.style.marginBottom = cloneHeight;
						} else if (e.clientY < closest.center && closest_index - clone_index != 1) {
							closest.el.style.marginTop = cloneHeight;
						}
						closest.el.style.borderColor = 'red';
						old_closest = closest.el;
					});
				};

				clone.onpointerup = (e) => {
					node.style.opacity = '1';
					clone.releasePointerCapture(pointerID);
					targets.sort((a, b) => (Math.abs(b.center - e.clientY) < Math.abs(a.center - e.clientY) ? 1 : -1));
					const closest = targets[0];
					let closest_index = parseInt(closest.el.getAttribute('data-index') as string);
					const clone_index = parseInt(clone.getAttribute('data-index') as string);
					const newFields = [...fields];
					const dragged_item = newFields.splice(clone_index, 1)[0];

					if (clone_index < closest_index) {
						closest_index--;
					}
					if (e.clientY > closest.center) {
						closest_index++;
					}
					newFields.splice(closest_index, 0, dragged_item);
					onFieldsUpdate(newFields);
					clone.remove();
					setTimeout(() => {
						targets.forEach((el) => {
							el.el.style.removeProperty('border-color');
							el.el.style.margin = '10px 0';
						});
					}, 50);
				};
			}, 200);
		}

		node.onpointerdown = drag;

		return {
			destroy() {
				node.onpointerdown = null;
			}
		};
	}

	function handleFieldClick(field: FieldInstance) {
		currentFieldKey = field.widget.Name;
		currentField = field;
	}

	function handleFieldDelete(field: FieldInstance, event: Event) {
		event.stopPropagation();
		const newFields = fields.filter((f: FieldInstance) => f !== field);
		onFieldsUpdate(newFields);
	}

	function handleSave() {
		// Implement save logic here
		currentField = null;
	}

	function handleCancel() {
		currentField = null;
	}

	$effect(() => {
		if (currentFieldKey) {
			// Any side effects related to currentFieldKey changes
		}
	});
</script>

<div class="wrapper" bind:this={container}>
	{#each fields as field, index (field.id)}
		<div
			class="field relative"
			aria-label="Widget"
			role="button"
			tabindex="0"
			data-index={index}
			onclick={() => handleFieldClick(field)}
			onkeydown={(e) => e.key === 'Enter' && handleFieldClick(field)}
			use:initDragAndDrop
		>
			<div class="h-full w-full p-[10px]">
				<p>widget: {field.widget.Name}</p>
				<p>label: {field.label}</p>
			</div>
			<button onclick={(e) => handleFieldDelete(field, e)} aria-label="Delete widget" class="absolute right-[5px] top-[5px]">
				<iconify-icon icon="tdesign:delete-1" width="24" height="24"></iconify-icon>
			</button>
		</div>
	{/each}
</div>

{#if currentField}
	<AddWidget {fields} field={currentField as any} addField={false} selected_widget={currentFieldKey} editField={true} />
{/if}

<!-- Edit individual selected widget  -->
{#if currentField}
	<div
		class="fixed -top-16 left-0 z-20 flex h-full w-full flex-col items-center justify-center overflow-auto bg-white dark:bg-surface-900 {uiStateManager
			.uiState.value.leftSidebar === 'full'
			? 'left-[220px] '
			: 'left-0 '}"
	>
		<div
			class="fixed top-0 flex items-center justify-between {uiStateManager.uiState.value.leftSidebar === 'full'
				? 'left-[220px] w-full'
				: 'left-0 w-screen'}"
		>
			<PageTitle name="Edit Widget" icon="material-symbols:ink-pen" iconColor="text-primary-500" />

			<div class="flex gap-2">
				<!-- Save Button -->
				<button class="preset-filled-primary-500 btn" aria-label="Save" onclick={handleSave}>{m.button_save()}</button>
				<!-- Cancel Button -->
				<button class="preset-ghost-secondary-500 btn-icon mr-2" aria-label="Cancel" onclick={handleCancel}>
					<iconify-icon icon="material-symbols:close" width="24"></iconify-icon>
				</button>
			</div>
		</div>

		<div class="z-100 flex flex-col items-center justify-center gap-1">
			<!-- Removed loop based on guiSchema, assuming AddWidget handles field editing internally -->
		</div>
	</div>
{/if}
