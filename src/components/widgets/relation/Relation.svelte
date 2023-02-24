<script lang="ts">
	import Fields from '$src/components/Fields.svelte';
	import { findById, find } from '$src/lib/utils/utils';
	import { shape_fields, saveSimpleData } from '$src/lib/utils/utils_svelte';
	import { getFieldsData, language } from '$src/stores/store';

	import DropDown from '$src/components/DropDown.svelte';

	// Skeleton
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';

	// Popup Tooltips
	let EditSettings: PopupSettings = {
		event: 'hover',
		target: 'EditPopup',
		placement: 'bottom'
	};
	let AddNewSettings: PopupSettings = {
		event: 'hover',
		target: 'AddNewPopup',
		placement: 'bottom'
	};

	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	export let field: any;
	export let value: any;
	export let widgetValue: string | null; // is relative data id
	$: widgetValue = typeof value == 'string' ? value : widgetValue; // widgetvalue is id, type is String, we need to update it later when value is changed.
	export let root = true;

	let expanded = false;
	let inputFields: HTMLDivElement[] = [];
	let fieldsValue = {};
	let showDropDown = false;
	let selectedField: any;
	let selected: any;
	let fields: any;
	$: selected
		? ((selectedField = selected.item), (widgetValue = selected._id))
		: (selectedField = null);
	let dropDownData: any = [];
	let display: any;

	let getData = async () => {
		let obj: any = {};
		if (!selected) {
			let relationField = fieldsValue;
			widgetValue =
				(await saveSimpleData(field.relation, relationField, widgetValue as string, !widgetValue))
					.data[0]?._id || widgetValue;
		} else {
			widgetValue = selected._id;
		}
		obj[field.db_fieldName] = widgetValue;
	};
	let _ = async (_language: string) => {
		if (value && typeof value == 'string') {
			value = await findById(value, field.relation);
		}
		//if we dont have display from entrylist already, generate new one
		display = (await field.rawDisplay(value))[_language];
	};
	$: _($language);

	if (root) $getFieldsData.add(getData); // extra push needed because getData gets pushed to executed functions when fields are expanded so choosing wont work without.
	shape_fields(field.relation.fields).then((data) => (fields = data));
</script>

{#if !expanded}
	<div
		class="flex items-center justify-center gap-1 rounded-lg bg-surface-200  dark:bg-surface-500"
	>
		<p
			on:click={async () => {
				!dropDownData.length && (dropDownData = await find({}, field.relation));
				showDropDown = !showDropDown;
			}}
			class="w-full cursor-pointer text-center text-black"
		>
			{selectedField || display || $LL.WIDGET_Relation_ChoseExisting()}
		</p>
		<button
			use:popup={EditSettings}
			on:click={() => {
				value = null;
				widgetValue = null;
				selected = null;
				display = null;
			}}
			class="btn"><Icon icon="bi:pencil-fill" width="22" /></button
		>
		<!-- Popup Tooltip with the arrow element -->
		<div class="card variant-filled-secondary p-4" data-popup="EditPopup">
			{$LL.WIDGET_Relation_Edit()}
			{collection.name}
			<div class="arrow variant-filled-secondary" />
		</div>

		<button
			use:popup={AddNewSettings}
			on:click={() => {
				expanded = !expanded;
				selected = null;
			}}
			class="btn mr-1"
			><Icon icon="ic:baseline-plus" width="22" />
			<!-- Popup Tooltip with the arrow element -->
			<div class="card variant-filled-secondary p-4" data-popup="AddNewPopup">
				{$LL.WIDGET_Relation_AddNew()}
				{collection.name}
				<div class="arrow variant-filled-secondary" />
			</div>
		</button>
	</div>

	<DropDown bind:showDropDown {dropDownData} bind:selected display={field.rawDisplay} />
{:else}
	<div class="relative my-4 rounded-lg border-2 border-[#8cccff] p-[20px]">
		<button
			on:click={() => {
				expanded = !expanded;
				selected = null;
			}}
			class="btn absolute top-0 right-0 z-10">X</button
		>

		<Fields {getData} bind:inputFields bind:fieldsValue value={selected || value} {fields} />
	</div>
{/if}
