<!-- 
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/tabs/CollectionWidget/Widget.svelte
@component
**The Widget component is used to display the widget form used in the CollectionWidget component**
-->
<script lang="ts">
	import { getGuiFields } from '@utils/utils';
	import type { DndEvent, Item } from 'svelte-dnd-action';

	// Stores
	import { page } from '$app/state';
	import { tabSet } from '@stores/store.svelte';
	import { collectionValue, targetWidget } from '@src/stores/collectionStore.svelte';

	// Components
	import widgets from '@widgets';
	import VerticalList from '@components/VerticalList.svelte';
	import ModalWidgetForm from './ModalWidgetForm.svelte';
	import ModalSelectWidget from './ModalSelectWidget.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton-svelte';

	interface Props {
		'on:save'?: () => void;
	}

	// Field interface
	interface Field extends Item {
		id: number;
		label: string;
		icon?: string;
		db_fieldName?: string;
		widget: {
			Name: string;
			key?: string;
			GuiFields?: Record<string, unknown>;
		};
		permissions: Record<string, Record<string, boolean>>;
		[key: string]: unknown;
	}

	let { 'on:save': onSave = () => {} }: Props = $props() as Props;

	const modalStore = getModalStore();

	// Extract the collection name from the URL
	const contentTypes = page.params.contentTypes;

	// Fields state with proper typing
	let fields = $state<Field[]>(
		((collectionValue.value.fields as any[]) || []).map((field, index) => {
			const baseField = {
				id: index + 1,
				label: field.label || '',
				widget: field.widget || { Name: '', key: '' },
				permissions: field.permissions || {}
			};
			return { ...field, ...baseField };
		})
	);

	// Effect to update fields when collection value changes
	$effect.root(() => {
		fields = ((collectionValue.value.fields as any[]) || []).map((field, index) => {
			const baseField = {
				id: index + 1,
				label: field.label || '',
				widget: field.widget || { Name: '', key: '' },
				permissions: field.permissions || {}
			};
			return { ...field, ...baseField };
		});
	});

	// Collection headers
	const headers = ['Id', 'Icon', 'Name', 'DBName', 'Widget'];

	// svelte-dnd-action
	const flipDurationMs = 300;

	const handleDndConsider = (e: CustomEvent<DndEvent>) => {
		fields = e.detail.items as Field[];
	};

	const handleDndFinalize = (e: CustomEvent<DndEvent>) => {
		fields = e.detail.items as Field[];
	};

	// Modal 2 to Edit a selected widget
	function modalWidgetForm(selectedWidget: Field): void {
		if (selectedWidget.permissions === undefined) {
			selectedWidget.permissions = {};
		}
		targetWidget.set(selectedWidget);
		const c: ModalComponent = { ref: ModalWidgetForm };
		const modal: ModalSettings = {
			type: 'component',
			component: c,
			title: 'Define your Widget',
			body: 'Setup your widget and then press Save.',
			value: selectedWidget,
			response: (r: Field | null) => {
				if (!r) return;
				// Find the index of the existing widget based on its ID
				const existingIndex = fields.findIndex((widget) => widget.id === r.id);

				if (existingIndex !== -1) {
					// If the existing widget is found, update its properties
					const updatedField = { ...fields[existingIndex], ...r };
					fields = [...fields.slice(0, existingIndex), updatedField, ...fields.slice(existingIndex + 1)];
					collectionValue.update((c) => ({
						...c,
						fields
					}));
				} else {
					// If the existing widget is not found, add it as a new widget
					const newField = { ...r, id: fields.length + 1 };
					fields = [...fields, newField];
					collectionValue.update((c) => ({
						...c,
						fields
					}));
				}
			}
		};
		modalStore.trigger(modal);
	}

	// Modal 1 to choose a widget
	function modalSelectWidget(selected?: Field): void {
		const c: ModalComponent = { ref: ModalSelectWidget };
		const modal: ModalSettings = {
			type: 'component',
			component: c,
			title: 'Select a Widget',
			body: 'Select your widget and then press submit.',
			value: selected,
			response: (r: { selectedWidget: string } | null) => {
				if (!r) return;
				const { selectedWidget } = r;
				const widget = { widget: { key: selectedWidget, Name: selectedWidget }, permissions: {} };
				targetWidget.set(widget);
				modalWidgetForm(widget as Field);
			}
		};
		modalStore.trigger(modal);
	}

	// Function to save data by sending a POST request
	async function handleCollectionSave() {
		fields = fields.map((field) => {
			const widgetInstance = widgets[field.widget.Name];
			if (!widgetInstance?.GuiSchema) return field;

			const GuiFields = getGuiFields({ key: field.widget.Name }, widgetInstance.GuiSchema);
			for (const [property, value] of Object.entries(field)) {
				if (typeof value !== 'object' && property !== 'id') {
					GuiFields[property] = value;
				}
			}
			field.widget.GuiFields = GuiFields;
			return field;
		});

		// Update the collection fields
		collectionValue.update((c) => ({
			...c,
			fields
		}));

		onSave();
	}
</script>

<div class="flex flex-col">
	<div class="preset-outline-tertiary dark:preset-outline-primary rounded-t-md p-2 text-center">
		<p>
			{m.collection_widgetfield_addrequired()} <span class="text-tertiary-500 dark:text-primary-500">{contentTypes}</span> Collection inputs.
		</p>
		<p class="mb-2">{m.collection_widgetfield_drag()}</p>
	</div>
	<div style="max-height: 55vh !important;">
		<VerticalList items={fields} {headers} {flipDurationMs} {handleDndConsider} {handleDndFinalize}>
			{#each fields as field (field.id)}
				<div
					class="border-blue preset-outline-surface hover:preset-filled-surface-500 my-2 grid w-full grid-cols-6 items-center rounded-md border p-1 text-left dark:text-white"
				>
					<div
						class="preset-tonal-tertiary border-tertiary-500 badge dark:preset-tonal-primary border-primary-500 h-10 w-10 rounded-full border border"
					>
						{field.id}
					</div>

					<iconify-icon icon={field.icon} width="24" class="text-tertiary-500"></iconify-icon>
					<div class="dark:text-primary-500 font-bold">{field.label}</div>
					<div class=" ">{field?.db_fieldName ? field.db_fieldName : '-'}</div>
					<div class=" ">{field.widget?.key}</div>

					<button
						type="button"
						onclick={() => modalWidgetForm(field)}
						aria-label={m.button_edit()}
						class="preset-tonal-primary border-primary-500 btn-icon ml-auto border"
					>
						<iconify-icon icon="ic:baseline-edit" width="24" class="dark:text-white"></iconify-icon>
					</button>
				</div>
			{/each}
		</VerticalList>
	</div>
	<div>
		<div class="mt-2 flex items-center justify-center gap-3">
			<button onclick={() => modalSelectWidget()} class="preset-filled-tertiary-500 btn">{m.collection_widgetfield_addFields()} </button>
		</div>
		<div class=" flex items-center justify-between">
			<button type="button" onclick={() => ($tabSet = 1)} class="preset-filled-secondary-500 btn mt-2 justify-end">{m.button_previous()}</button>
			<button
				type="button"
				onclick={handleCollectionSave}
				class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500 mt-2 justify-end dark:text-black">{m.button_save()}</button
			>
		</div>
	</div>
</div>
