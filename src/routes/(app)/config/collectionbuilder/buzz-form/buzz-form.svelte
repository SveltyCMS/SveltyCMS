<!-- 
@file src/routes/(app)/config/collectionbuilder/buzz-form/buzz-form.svelte
@component BuzzForm Canvas & Inspector Shell
 -->
<script lang="ts">
import {
	collections,
	setTargetWidget,
} from "@src/stores/collection-store.svelte";
import { toast } from "@src/stores/toast.svelte.ts";
import { widgets } from "@src/stores/widget-store.svelte.ts";
import { asAny, getGuiFields } from "@utils/utils";
import { registerHotkey } from "@src/utils/hotkeys";
import { onMount } from "svelte";
import BuzzFormCanvas from "./buzz-form-canvas.svelte";
import FieldInspector from "./field-inspector.svelte";
import WidgetSidebar from "./widget-sidebar.svelte";

let selectedFieldId = $state<number | string | undefined>(undefined);
const fields = $derived((collections.active?.fields as any[]) || []);

onMount(() => {
	// Canvas Hotkeys
	registerHotkey(
		"delete",
		() => {
			if (selectedFieldId !== undefined) handleDeleteField();
		},
		"Delete Selected Field",
	);

	registerHotkey(
		"mod+d",
		() => {
			if (selectedFieldId !== undefined) handleDuplicateField();
		},
		"Duplicate Selected Field",
	);
});

function handleAddWidget(key: string) {
	const widgetInstance = asAny<any>(widgets.widgetFunctions)[key];
	if (widgetInstance) {
		const newId = fields.length + 1;
		const newField = {
			id: newId,
			label: `New ${key}`,
			db_fieldName: `field_${newId}_${key.toLowerCase()}`,
			widget: { key, Name: key } as any,
			icon: widgetInstance.Icon || "mdi:widgets",
			GuiFields: getGuiFields({ key }, asAny(widgetInstance.GuiSchema)),
			permissions: {},
			required: false,
		};

		if (collections.active) {
			collections.active.fields = [...fields, newField];
		}
		handleSelectField(newField);
		toast.success(`Added ${key} to canvas`);
	}
}

function handleNodeUpdate(updatedItems: any[]) {
	if (collections.active) {
		collections.active.fields = updatedItems.map((item, index) => ({
			...item,
			id: index + 1,
		}));
	}
}

function handleSelectField(field: any) {
	selectedFieldId = field.id;
	setTargetWidget(field);
}

function handleDeleteField() {
	if (selectedFieldId !== undefined && collections.active) {
		const newFields = fields.filter((f) => f.id !== selectedFieldId);
		collections.active.fields = newFields.map((f, i) => ({ ...f, id: i + 1 }));
		selectedFieldId = undefined;
		setTargetWidget({ permissions: {} });
		toast.info("Field removed from canvas");
	}
}

function handleDuplicateField() {
	if (selectedFieldId !== undefined && collections.active) {
		const original = fields.find((f) => f.id === selectedFieldId);
		if (!original) return;

		const newId = fields.length + 1;
		const duplicatedField = {
			...structuredClone(original),
			id: newId,
			label: `${original.label} (Copy)`,
			db_fieldName: `${original.db_fieldName}_copy`,
		};

		collections.active.fields = [...fields, duplicatedField];
		handleSelectField(duplicatedField);
		toast.success("Field duplicated");
	}
}
</script>

<div class="flex h-[calc(100vh-180px)] overflow-hidden rounded-2xl border border-surface-200-800 bg-white dark:bg-surface-900 shadow-xl">
	<WidgetSidebar onAddWidget={handleAddWidget} />
	<BuzzFormCanvas {fields} {selectedFieldId} onNodeUpdate={handleNodeUpdate} onSelectField={handleSelectField} />
	<FieldInspector onDelete={handleDeleteField} onDuplicate={handleDuplicateField} />
</div>
