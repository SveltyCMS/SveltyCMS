<!--
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/tabs/CollectionWidget/Widget.svelte
@component
**The Widget component is used to display the widget form used in the CollectionWidget component**
-->
<script lang="ts">
import VerticalList from "@src/components/vertical-list.svelte";
import {
	button_edit,
	button_previous,
	button_save,
	collection_widgetfield_addFields,
	collection_widgetfield_addrequired,
	collection_widgetfield_drag,
} from "@src/paraglide/messages";
import {
	collectionValue,
	setCollectionValue,
	setTargetWidget,
} from "@src/stores/collection-store.svelte";
import { app } from "@src/stores/store.svelte.ts";
import { getWidgetFunction } from "@src/stores/widget-store.svelte.ts";
// Native UI Components
import { modalState } from "@utils/modal.svelte";
// Using iconify-icon web component
import { getGuiFields } from "@utils/utils";
import type { DragDropState } from '@thisux/sveltednd';
// Stores
import { page } from "$app/state";
import ModalSelectWidget from "./modal-select-widget.svelte";
import ModalWidgetForm from "./modal-widget-form.svelte";
	import Button from '@components/ui/button.svelte';

interface Props {
	"on:save"?: () => void;
}

// Field interface
interface Field {
	db_fieldName?: string;
	icon?: string;
	id: number;
	label: string;
	permissions: Record<string, Record<string, boolean>>;
	widget: {
		Name: string;
		key?: string;
		GuiFields?: Record<string, unknown>;
	};
	[key: string]: unknown;
}

const { "on:save": onSave = () => {} }: Props = $props() as Props;

// Extract the collection name from the URL
const contentTypes = page.params.contentTypes;

// Fields state with proper typing
let fields = $state<Field[]>(
	((collectionValue.value.fields as any[]) || []).map((field, index) => {
		const baseField = {
			id: index + 1,
			label: field.label || "",
			widget: field.widget || { Name: "", key: "" },
			permissions: field.permissions || {},
		};
		return { ...field, ...baseField };
	}),
);

// Effect to update fields when collection value changes
$effect.root(() => {
	fields = ((collectionValue.value.fields as any[]) || []).map(
		(field, index) => {
			const baseField = {
				id: index + 1,
				label: field.label || "",
				widget: field.widget || { Name: "", key: "" },
				permissions: field.permissions || {},
			};
			return { ...field, ...baseField };
		},
	);
});

// Collection headers
const headers = ["Id", "Icon", "Name", "DBName", "Widget"];

const handleFieldDrop = (state: DragDropState<{ item: Record<string, unknown>; index: number }>) => {
	if (!state.item) return;
	const fromIndex = state.item.index;
	const toIndex = state.targetIndex;
	if (fromIndex === toIndex || toIndex < 0) return;
	const newFields = [...fields];
	newFields.splice(fromIndex, 1);
	newFields.splice(toIndex, 0, state.item.item as Field);
	fields = newFields as Field[];
};

// Modal 2 to Edit a selected widget
function modalWidgetForm(selectedWidget: Field): void {
	if (selectedWidget.permissions === undefined) {
		selectedWidget.permissions = {};
	}
	setTargetWidget(selectedWidget);
	modalState.trigger(
		ModalWidgetForm as any,
		{
			title: "Define your Widget",
			body: "Setup your widget and then press Save.",
			value: selectedWidget,
		},
		(r: Field | null) => {
			if (!r) {
				return;
			}
			// Find the index of the existing widget based on its ID
			const existingIndex = fields.findIndex((widget) => widget.id === r.id);

			if (existingIndex !== -1) {
				// If the existing widget is found, update its properties
				const updatedField = { ...fields[existingIndex], ...r };
				fields = [
					...fields.slice(0, existingIndex),
					updatedField,
					...fields.slice(existingIndex + 1),
				];
				setCollectionValue({
					...collectionValue,
					fields,
				});
			} else {
				// If the existing widget is not found, add it as a new widget
				const newField = { ...r, id: fields.length + 1 };
				fields = [...fields, newField];
				setCollectionValue({
					...collectionValue,
					fields,
				});
			}
		},
	);
}

// Modal 1 to choose a widget
function modalSelectWidget(selected?: Field): void {
	modalState.trigger(
		ModalSelectWidget as any,
		{
			title: "Select a Widget",
			body: "Select your widget and then press submit.",
			value: selected,
		},
		(r: { selectedWidget: string } | null) => {
			if (!r) {
				return;
			}
			const { selectedWidget } = r;
			const widget = {
				widget: { key: selectedWidget, Name: selectedWidget },
				permissions: {},
			};
			setTargetWidget(widget as any);
			modalWidgetForm(widget as Field);
		},
	);
}

// Function to save data by sending a POST request
async function handleCollectionSave() {
	fields = fields.map((field) => {
		const widgetInstance = getWidgetFunction(field.widget.Name);
		const guiSchema = widgetInstance?.GuiSchema;
		if (!guiSchema) {
			return field;
		}

		const GUI_FIELDS = getGuiFields(
			{ key: field.widget.Name },
			guiSchema as any,
		);
		for (const [property, value] of Object.entries(field)) {
			if (typeof value !== "object" && property !== "id") {
				GUI_FIELDS[property] = value;
			}
		}
		field.widget.GuiFields = GUI_FIELDS;
		return field;
	});

	// Update the collection fields
	setCollectionValue({
		...collectionValue.value,
		fields,
	});

	onSave();
}
</script>

<div class="flex flex-col">
	<div class="preset-outlined-tertiary-500 rounded-t-md p-2 text-center dark:preset-outlined-primary-500">
		<p>
			{collection_widgetfield_addrequired()}
			<span class="text-tertiary-500 dark:text-primary-500">{contentTypes}</span>
			Collection inputs.
		</p>
		<p class="mb-2">{collection_widgetfield_drag()}</p>
	</div>
	<div style="max-height: 55vh !important;">
		<VerticalList items={fields} {headers} container="widget-fields" onDrop={handleFieldDrop}>
			{#snippet children(item)}
				<div
					class="border-blue preset-outlined-surface-500 my-2 grid w-full grid-cols-6 items-center rounded border p-1 text-start hover:preset-filled-surface-500 dark:text-white"
					role="row"
				>
					<div class="preset-ghost-tertiary-500 badge h-10 w-10 rounded-full dark:preset-ghost-primary-500" role="cell">{(item as any).id}</div>

					<div role="cell" class="flex justify-center"><iconify-icon icon={(item as any).icon} width="24" class="text-tertiary-500"></iconify-icon></div>
					<div class="font-bold dark:text-primary-500" role="cell">{(item as any).label}</div>
					<div class=" " role="cell">{(item as any)?.db_fieldName ? (item as any).db_fieldName : '-'}</div>
					<div class=" " role="cell">{(item as any).widget?.key}</div>

					<div role="cell" class="flex justify-end">
						<Button variant="ghost" type="button" onclick={() => modalWidgetForm(item as Field)} aria-label={button_edit()} class="p-0! min-w-0 ml-auto">
							<iconify-icon icon="ic:baseline-edit" width={24}></iconify-icon>
						</Button>
					</div>
				</div>
			{/snippet}
		</VerticalList>
	</div>
	<div>
		<div class="mt-2 flex items-center justify-center gap-3">
			<Button variant="tertiary" onclick={() => modalSelectWidget()}>{collection_widgetfield_addFields()} </Button>
		</div>
		<div class=" flex items-center justify-between">
			<Button variant="secondary" type="button" onclick={() => (app.tabSetState = 1)} class="mt-2 justify-end">{button_previous()}</Button>
			<Button variant="tertiary"
				type="button"
				onclick={handleCollectionSave}
			 class="mt-2 justify-end dark: dark:text-black">
				{button_save()}
			</Button>
		</div>
	</div>
</div>
