<!-- 
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/tabs/CollectionWidget/ModalWidgetForm.svelte
@component
**The ModalWidgetForm component is used to display and manage the form for the selected widget in the CollectionWidget component** 
It handles widget configuration, permissions, and specific options.
-->

<script lang="ts">
	import { type SvelteComponent } from 'svelte';

	// Components
	import widgets from '@widgets';
	import Default from './tabsFields/Default.svelte';
	import Permission from './tabsFields/Permission.svelte';
	import Specific from './tabsFields/Specific.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Stores
	import { collectionValue, targetWidget } from '@src/stores/collectionStore.svelte';

	import { getModalStore, TabGroup, Tab } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	let localTabSet: number = $state(0);

	// Props

	interface Props {
		/** Exposes parent props to this component. */
		parent: SvelteComponent;
	}

	let { parent }: Props = $props();

	// Local variables
	let modalData = $derived($modalStore[0]);
	let widgetKey = $derived(modalData?.value?.widget?.key as keyof typeof widgets);
	let guiSchema = $derived(widgets[widgetKey]?.GuiSchema || widgets);

	// Derive options from guiSchema
	let options = $derived(guiSchema ? Object.keys(guiSchema) : []);
	let specificOptions = $derived(
		options.filter(
			(option) => !['label', 'display', 'db_fieldName', 'required', 'translated', 'icon', 'helper', 'width', 'permissions'].includes(option)
		)
	);

	// We've created a custom submit function to pass the response and close the modal.
	async function onFormSubmit(): Promise<void> {
		if (modalData?.response) {
			modalData.response(targetWidget.value);
		}
		modalStore.close();
	}

	// Function to delete the widget
	function deleteWidget() {
		const confirmDelete = confirm('Are you sure you want to delete this widget?');
		if (confirmDelete) {
			// Perform deletion logic here
			collectionValue.update((c) => {
				if (c && Array.isArray(c.fields)) {
					c.fields = c.fields.filter((field: any) => field.id !== modalData?.value.id);
				}
				return c;
			});
			modalStore.close();
		}
	}

	// Base Classes
	const cBase = 'card p-4 w-screen h-screen shadow-xl space-y-4 bg-white';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';
</script>

{#if modalData}
	<div class={cBase}>
		<header class={cHeader}>
			{modalData?.title ?? '(title missing)'}
		</header>
		<article class="text-center">
			{modalData?.body ?? '(body missing)'}
		</article>

		<!-- Tabs Headers -->
		<form class={cForm}>
			<TabGroup justify="justify-between lg:justify-start">
				<!-- Default Tab -->
				<Tab bind:group={localTabSet} name="tab1" value={0}>
					<div class="flex items-center gap-1">
						<iconify-icon icon="mdi:required" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						<span>Default</span>
					</div>
				</Tab>

				<!-- Permissions Tab -->
				<Tab bind:group={localTabSet} name="tab2" value={1}>
					<div class="flex items-center gap-1">
						<iconify-icon icon="mdi:security-lock" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						<span>{m.system_permission()}</span>
					</div>
				</Tab>

				<!-- Specific Tab (only shown if there are specific options) -->
				{#if specificOptions.length > 0}
					<Tab bind:group={localTabSet} name="tab3" value={2}>
						<div class="flex items-center gap-1">
							<iconify-icon icon="ph:star-fill" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
							<span>Specific</span>
						</div>
					</Tab>
				{/if}
			</TabGroup>

			<!-- Tab Panels -->
			{#if localTabSet === 0}
				<Default {guiSchema} />
			{:else if localTabSet === 1}
				<Permission />
			{:else if localTabSet === 2}
				<Specific />
			{/if}
		</form>

		<footer class="{parent.regionFooter} justify-between">
			<!-- Delete Button -->
			<button type="button" onclick={deleteWidget} aria-label="Delete" class="variant-filled-error btn">
				<iconify-icon icon="icomoon-free:bin" width="24"></iconify-icon>
				<span class="hidden sm:block">{m.button_delete()}</span>
			</button>

			<!-- Cancel & Save Buttons -->
			<div class="flex justify-between gap-4">
				<button type="button" aria-label={m.button_cancel()} class="btn {parent.buttonNeutral}" onclick={parent.onClose}>{m.button_cancel()}</button>
				<button type="button" aria-label={m.button_save()} class="btn {parent.buttonPositive}" onclick={onFormSubmit}>{m.button_save()}</button>
			</div>
		</footer>
	</div>
{/if}
