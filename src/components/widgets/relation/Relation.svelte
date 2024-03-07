<script lang="ts">
	// Stores
	import { entryData, mode, contentLanguage, collection, collections, saveFunction } from '@stores/store';

	// Components
	import DropDown from './DropDown.svelte';
	import Fields from '@components/Fields.svelte';

	import type { FieldType } from '.';
	import { extractData, find, findById, getFieldName, saveFormData } from '@utils/utils';

	export let field: FieldType | undefined;
	let fieldName = getFieldName(field);
	export const value = $entryData[fieldName];
	export let expanded = false;

	let dropDownData: any;
	let selected: { display: any; _id: any } | undefined = undefined;
	let fieldsData = {};
	let showDropDown = false;
	let entryMode: 'create' | 'edit' | 'choose' = 'choose';
	let relation_entry: any;
	let relationCollection = $collections.find((x) => x.name == field?.relation);

	export const WidgetData = async () => {
		let relation_id = '';
		if (!field) return;
		if (entryMode == 'create') {
			relation_id = (await saveFormData({ data: fieldsData, _collection: relationCollection, _mode: 'create' }))[0]?._id;
			// console.log(relation_id);
		} else if (entryMode == 'choose') {
			relation_id = selected?._id;
		} else if (entryMode == 'edit') {
			relation_id = (await saveFormData({ data: fieldsData, _collection: relationCollection, _mode: 'edit', id: relation_entry._id }))[0]?._id;
		}
		return relation_id;
	};

	async function openDropDown() {
		if (!field) return;
		dropDownData = await find({}, field.relation);
		showDropDown = true;
		entryMode = 'choose';
	}

	let display = '';

	$: (async (_) => {
		let data: any;
		if ($mode == 'edit' && field) {
			if (entryMode == 'edit' || entryMode == 'create') {
				data = await extractData(fieldsData);
			} else if (entryMode == 'choose') {
				data = $entryData[getFieldName(field)];
			}
			!relation_entry && (relation_entry = data);
		} else {
			data = await extractData(fieldsData);
		}
		display = await field?.display({ data, field, collection: $collection, entry: $entryData, contentLanguage: $contentLanguage });
	})(expanded);

	function save() {
		expanded = false;
		$saveFunction.reset();
	}
</script>

{#if !expanded && !showDropDown}
	<div class="relative mb-1 flex w-screen min-w-[200px] max-w-full items-center justify-start gap-0.5 rounded border py-1 pl-10 pr-2">
		<button class="flex-grow text-center dark:text-primary-500" on:click={openDropDown}>{@html selected?.display || display || 'select new'}</button>
		<div class="ml-auto flex items-center pr-2">
			{#if $mode == 'create'}
				<button
					on:click={() => {
						expanded = !expanded;
						entryMode = 'create';
						fieldsData = {};
						selected = undefined;
						relation_entry = {};
					}}
					class="btn-icon"
					><iconify-icon icon="icons8:plus" width="30" class="dark:text-primary-500" />
				</button>
			{/if}
			<button
				on:click={() => {
					expanded = !expanded;
					entryMode = 'edit';
					fieldsData = {};
					selected = undefined;
				}}
				class="btn-icons"
				><iconify-icon icon="mdi:pen" width="28" class="dark:text-primary-500" />
			</button>
		</div>
	</div>
{:else if !expanded && showDropDown}
	<DropDown {dropDownData} {field} bind:selected bind:showDropDown />
{:else}
	<Fields fields={relationCollection?.fields} root={false} bind:fieldsData customData={relation_entry} />
	{(($saveFunction.fn = save), '')}
{/if}
