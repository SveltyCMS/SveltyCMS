<!--
@file src/components/system/builder/widget-fields.svelte
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
	import Button from '@components/ui/button.svelte';
	import type { FieldInstance } from '@content/types';
	import PageTitle from '@src/components/page-title.svelte';
	import { ui } from '@src/stores/ui-store.svelte';
	import AddWidget from './add-widget.svelte';

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
				[...(container?.getElementsByClassName('field') || [])].map((el) => {
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
				// eslint-disable-next-line svelte/no-dom-manipulating
				container?.appendChild(clone);
				clone.setPointerCapture(pointerID);
				node.style.opacity = '0.5';
				clone.style.left = `${node.getBoundingClientRect().left}px`;
				clone.style.marginLeft = '0';
				clone.style.position = 'fixed';
				clone.style.top = `${e.clientY}px`;
				clone.style.width = `${node.getBoundingClientRect().width}px`;
				const cloneHeight = `${clone.offsetHeight + 10}px`;
				let debTimeoutId: ReturnType<typeof setTimeout>;
				const deb = (fn: () => void) => {
					clearTimeout(debTimeoutId);
					debTimeoutId = setTimeout(fn, 50);
				};
				let oldClosest: HTMLElement;

				clone.onpointermove = (e) => {
					if (e.clientY < container!.offsetTop || e.clientY > container!.offsetTop + container!.offsetHeight - 60) {
						if (e.clientY < container!.offsetTop) {
							container?.scrollBy(0, -5);
						} else {
							container?.scrollBy(0, 5);
						}
					}
					clone.style.top = `${e.clientY}px`;
					deb(() => {
						targets = [...(container?.getElementsByClassName('field') || [])]
							.map((el) => {
								const rect = el.getBoundingClientRect();
								return {
									el: el as HTMLElement,
									center: rect.top + rect.height / 2
								};
							})
							.filter((el) => el.el !== clone);
						targets.sort((a, b) => (Math.abs(b.center - e.clientY) < Math.abs(a.center - e.clientY) ? 1 : -1));
						const closest = targets[0];
						if (closest.el === node) {
							return;
						}
						const closestIndex = Number.parseInt(closest.el.getAttribute('data-index') as string, 10);
						const cloneIndex = Number.parseInt(clone.getAttribute('data-index') as string, 10);

						if (oldClosest) {
							oldClosest.style.removeProperty('border-color');
							oldClosest.style.margin = '10px 0';
						}
						if (e.clientY > closest.center && cloneIndex - closestIndex !== 1) {
							closest.el.style.marginBottom = cloneHeight;
						} else if (e.clientY < closest.center && closestIndex - cloneIndex !== 1) {
							closest.el.style.marginTop = cloneHeight;
						}
						closest.el.style.borderColor = 'red';
						oldClosest = closest.el;
					});
				};

				clone.onpointerup = (e) => {
					node.style.opacity = '1';
					clone.releasePointerCapture(pointerID);
					targets.sort((a, b) => (Math.abs(b.center - e.clientY) < Math.abs(a.center - e.clientY) ? 1 : -1));
					const closest = targets[0];
					let closestIndex = Number.parseInt(closest.el.getAttribute('data-index') as string, 10);
					const cloneIndex = Number.parseInt(clone.getAttribute('data-index') as string, 10);
					const newFields = [...fields];
					const draggedItem = newFields.splice(cloneIndex, 1)[0];

					if (cloneIndex < closestIndex) {
						closestIndex--;
					}
					if (e.clientY > closest.center) {
						closestIndex++;
					}
					newFields.splice(closestIndex, 0, draggedItem);
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
			<div class="h-full w-full p-2.5">
				<p>widget: {field.widget.Name}</p>
				<p>label: {field.label}</p>
			</div>
			<Button variant="ghost" size="sm" onclick={(e: MouseEvent) => handleFieldDelete(field, e)} aria-label="Delete widget" class="absolute inset-e-1.25 top-1.25">
					<iconify-icon icon="tdesign:delete-1" width="24" height="24"></iconify-icon>
				</Button>
		</div>
	{/each}
</div>

{#if currentField}
	<AddWidget {fields} field={currentField as any} addField={false} selected_widget={currentFieldKey} editField={true} />
{/if}

<!-- Edit individual selected widget  -->
{#if currentField}
	<div
		class="fixed -top-16 inset-s-0 z-20 flex h-full w-full flex-col items-center justify-center overflow-auto bg-white dark:bg-surface-900 {ui.state
			.leftSidebar === 'full'
			? 'inset-s-55'
			: 'inset-s-0'}"
	>
		<div class="fixed top-0 flex items-center justify-between {ui.state.leftSidebar === 'full' ? 'inset-s-55 w-full' : 'inset-s-0 w-screen'}">
			<PageTitle name="Edit Widget" icon="material-symbols:ink-pen" />

			<div class="flex gap-2">
				<!-- Save Button -->
				<Button variant="tertiary" aria-label="Save" onclick={handleSave} class="dark:">Save</Button>
				<!-- Cancel Button -->
				<Button variant="outline" aria-label="Cancel" onclick={handleCancel} class="p-0! min-w-0 me-2">
					<iconify-icon icon="material-symbols:close" width="24"></iconify-icon>
				</Button>
			</div>
		</div>

		<div class="z-100 flex flex-col items-center justify-center gap-1">
			<!-- Removed loop based on guiSchema, assuming AddWidget handles field editing internally -->
		</div>
	</div>
{/if}
