<!-- 
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/tabs/CollectionWidget/ModalWidgetForm.svelte
@component
**The ModalWidgetForm component is used to display and manage the form for the selected widget in the CollectionWidget component** 
It handles widget configuration, permissions, and specific options.
-->

<script lang="ts">
	import { type SvelteComponent } from 'svelte';

	// Components
	import { widgetFunctions } from '@stores/widgetStore.svelte';
	import Default from './tabsFields/Default.svelte';
	import Permission from './tabsFields/Permission.svelte';
	import Specific from './tabsFields/Specific.svelte';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Stores
	import { collectionValue, setCollectionValue, targetWidget } from '@src/stores/collectionStore.svelte';

	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import { modalState } from '@utils/modalState.svelte';

	let localTabSet = $state('0');

	// Props

	interface Props {
		/** Exposes parent props to this component. */
		parent?: any;
		value: any;
		response?: (r: any) => void;
		title?: string;
		body?: string;
	}

	const { parent = {}, value, response, title, body }: Props = $props();

	// Local variables
	// const modalData = $derived($modalStore[0]);
	// Use props directly instead of modalData
	// Widget key is the folder name (lowercase), not the widget Name
	const widgetKey = $derived(value?.widget?.key || (value?.widget?.Name?.toLowerCase() as string));
	const availableWidgets = $derived($widgetFunctions || {});
	const guiSchema = $derived((availableWidgets[widgetKey]?.GuiSchema || {}) as Record<string, { widget: typeof SvelteComponent }>);

	// Derive options from guiSchema
	const options = $derived(guiSchema ? Object.keys(guiSchema) : []);
	const specificOptions = $derived(
		options.filter(
			(option) => !['label', 'display', 'db_fieldName', 'required', 'translated', 'icon', 'helper', 'width', 'permissions'].includes(option)
		)
	);

	// We've created a custom submit function to pass the response and close the modal.
	async function onFormSubmit(): Promise<void> {
		if (response) {
			response(targetWidget);
		}
		modalState.close();
	}

	// Function to delete the widget
	function deleteWidget() {
		const confirmDelete = confirm('Are you sure you want to delete this widget?');
		if (confirmDelete) {
			// Perform deletion logic here
			if (collectionValue && Array.isArray(collectionValue.value.fields)) {
				const newFields = (collectionValue.value.fields as any[]).filter((field: any) => field.id !== value.id);
				setCollectionValue({
					...collectionValue.value,
					fields: newFields
				});
			}
			modalState.close();
		}
	}

	// Base Classes
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-xl';
</script>

<div class="space-y-4">
	<header class="text-2xl font-bold text-center">
		{title ?? '(title missing)'}
	</header>
	<article class="text-center">
		{body ?? '(body missing)'}
	</article>

	<!-- Tabs Headers -->
	<form class={cForm}>
		<Tabs value={localTabSet} onValueChange={(e) => (localTabSet = e.value)}>
			<Tabs.List class="flex justify-between lg:justify-start border-b border-surface-200-800">
				<Tabs.Trigger value="0">
					<div class="flex items-center gap-1 py-2 px-4">
						<iconify-icon icon="mdi:required" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						<span>Default</span>
					</div>
				</Tabs.Trigger>
				<Tabs.Trigger value="1">
					<div class="flex items-center gap-1 py-2 px-4">
						<iconify-icon icon="mdi:security-lock" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						<span>{m.system_permission()}</span>
					</div>
				</Tabs.Trigger>

				{#if specificOptions.length > 0}
					<Tabs.Trigger value="2">
						<div class="flex items-center gap-1 py-2 px-4">
							<iconify-icon icon="ph:star-fill" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
							<span>Specific</span>
						</div>
					</Tabs.Trigger>
				{/if}
			</Tabs.List>

			<Tabs.Content value="0">
				<Default {guiSchema} />
			</Tabs.Content>
			<Tabs.Content value="1">
				<Permission />
			</Tabs.Content>
			{#if specificOptions.length > 0}
				<Tabs.Content value="2">
					<Specific />
				</Tabs.Content>
			{/if}
		</Tabs>
	</form>

	<div class="hidden"></div>

	<footer class="flex justify-between pt-4 border-t border-surface-500/20">
		<!-- Delete Button -->
		<button type="button" onclick={deleteWidget} aria-label="Delete" class="preset-filled-error-500 btn">
			<iconify-icon icon="icomoon-free:bin" width="24"></iconify-icon>
			<span class="hidden sm:block">{m.button_delete()}</span>
		</button>

		<!-- Cancel & Save Buttons -->
		<div class="flex justify-between gap-4">
			<button type="button" aria-label={m.button_cancel()} class="btn preset-outlined-secondary-500" onclick={() => modalState.close()}
				>{m.button_cancel()}</button
			>
			<button type="button" aria-label={m.button_save()} class="btn preset-filled-primary-500" onclick={onFormSubmit}>{m.button_save()}</button>
		</div>
	</footer>
</div>
