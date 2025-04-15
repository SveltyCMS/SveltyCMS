<!-- 
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/tabs/CollectionWidget/ModalWidgetForm.svelte
@component
**The ModalWidgetForm component is used to display and manage the form for the selected widget in the CollectionWidget component** 
It handles widget configuration, permissions, and specific options.
-->

<script lang="ts">
	// import { type SvelteComponent } from 'svelte'; // Removed unused import

	// Components
	import widgets from '@widgets';
	import Default from './tabsFields/Default.svelte';
	import Permission from './tabsFields/Permission.svelte';
	import Specific from './tabsFields/Specific.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { Modal, Tab, Tabs } from '@skeletonlabs/skeleton-svelte'; // Try -svelte path again

	// Define the shape of the widget data
	// TODO: Define a more specific type if possible
	type WidgetFormData = any;

	// Props
	interface Props {
		open?: boolean;
		widgetData: WidgetFormData; // Receive initial data
		onSubmit: (data: WidgetFormData) => void; // Callback for submit
		onDelete: (id: string | number) => void; // Callback for delete
		onClose: () => void; // Callback for close
	}

	let { open = $bindable(), widgetData, onSubmit, onDelete, onClose }: Props = $props();

	let tabSet: number = $state(0);

	// Local state for the form, initialized from props
	let localWidgetData = $state<WidgetFormData>(JSON.parse(JSON.stringify(widgetData || {}))); // Deep clone

	// Effect to update local state when props change (modal opens for different widget)
	$effect(() => {
		if (widgetData) {
			localWidgetData = JSON.parse(JSON.stringify(widgetData)); // Deep clone
			// Ensure permissions object exists
			if (!localWidgetData.permissions) {
				localWidgetData.permissions = {};
			}
		} else {
			localWidgetData = {}; // Reset if no data
		}
		tabSet = 0; // Reset tab on open
	});

	let widgetKey = $derived(localWidgetData?.widget?.key as keyof typeof widgets);
	// Use 'as any' workaround for GuiSchema
	let guiSchema = $derived((widgets[widgetKey] as any)?.GuiSchema || {}); // Default to empty object

	// Derive options from guiSchema
	let options = $derived(guiSchema ? Object.keys(guiSchema) : []);
	let specificOptions = $derived(
		options.filter(
			(option) => !['label', 'display', 'db_fieldName', 'required', 'translated', 'icon', 'helper', 'width', 'permissions'].includes(option)
		)
	);

	// Submit function calls the onSubmit prop
	async function onFormSubmit(): Promise<void> {
		onSubmit(localWidgetData);
		// Parent handles closing
	}

	// Delete function calls the onDelete prop
	function handleDelete() {
		const confirmDelete = confirm('Are you sure you want to delete this widget?');
		if (confirmDelete && localWidgetData?.id) {
			onDelete(localWidgetData.id);
			// Parent handles closing
		}
	}
</script>

<Modal
	{open}
	onOpenChange={(e: { open: boolean }) => {
		// Add type to event parameter
		if (!e.open) {
			onClose(); // Call onClose if closed externally
		}
	}}
	contentBase="card bg-surface-100-900 p-4 md:p-6 space-y-4 shadow-xl max-w-screen-lg rounded-lg"
	backdropClasses="backdrop-blur-sm"
>
	<!-- Modal Content -->
	{#snippet content()}
		<header class="border-surface-300-700 flex items-center justify-between border-b pb-4">
			<h2 class="h2">Define your Widget ({widgetKey || 'New'})</h2>
			<button type="button" class="btn-icon btn-icon-sm preset-soft hover:preset-ghost" aria-label="Close modal" onclick={onClose}>
				<iconify-icon icon="mdi:close" width="20"></iconify-icon>
			</button>
		</header>

		<article class="text-center">Setup your widget and then press Save.</article>

		<!-- Tabs Headers -->
		<!-- Note: Removed outer form tag, submit handled by button -->
		<div class="space-y-4">
			<Tabs justify="justify-between lg:justify-start">
				<!-- Default Tab -->
				<Tab bind:group={tabSet} name="tab1" value={0}>
					<div class="flex items-center gap-1">
						<iconify-icon icon="mdi:required" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						<span>Default</span>
					</div>
				</Tab>

				<!-- Permissions Tab -->
				<Tab bind:group={tabSet} name="tab2" value={1}>
					<div class="flex items-center gap-1">
						<iconify-icon icon="mdi:security-lock" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						<span>{m.system_permission()}</span>
					</div>
				</Tab>

				<!-- Specific Tab (only shown if there are specific options) -->
				{#if specificOptions.length > 0}
					<Tab bind:group={tabSet} name="tab3" value={2}>
						<div class="flex items-center gap-1">
							<iconify-icon icon="ph:star-fill" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
							<span>Specific</span>
						</div>
					</Tab>
				{/if}
			</Tabs>

			<!-- Tab Panels -->
			<!-- TODO: Update child components to accept parts of localWidgetData as props and emit changes -->
			{#if tabSet === 0}
				<Default bind:widgetData={localWidgetData} {guiSchema} />
			{:else if tabSet === 1}
				<Permission bind:permissions={localWidgetData.permissions} />
			{:else if tabSet === 2}
				<Specific bind:widgetData={localWidgetData} {specificOptions} {guiSchema} />
			{/if}
		</div>

		<footer class="flex justify-between pt-4">
			<!-- Delete Button -->
			<button type="button" onclick={handleDelete} aria-label="Delete Widget" class="btn preset-filled-error">
				<iconify-icon icon="icomoon-free:bin" width="20" class="mr-1"></iconify-icon>
				<span class="hidden sm:inline">{m.button_delete()}</span>
			</button>

			<!-- Cancel & Save Buttons -->
			<div class="flex gap-3">
				<button type="button" aria-label={m.button_cancel()} class="btn preset-soft" onclick={onClose}>{m.button_cancel()}</button>
				<button type="button" aria-label={m.button_save()} class="btn preset-filled-primary" onclick={onFormSubmit}>{m.button_save()}</button>
			</div>
		</footer>
	{/snippet}
</Modal>
