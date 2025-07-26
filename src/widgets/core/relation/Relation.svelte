<!-- 
@file src/widgets/core/relation/Relation.svelte
@component
**Relation widget component to display relation field**

@example
<Relation label="Relation" db_fieldName="relation" required={true} />

### Props	
- `field`: FieldType
- `value`: any

### Features
- Translatable
-->

<script lang="ts">
	import { onDestroy } from 'svelte';

	// Stores
	import { contentLanguage, saveFunction, validationStore } from '@stores/store.svelte';
	import { collectionValue, mode, collection, collections } from '@root/src/stores/collectionStore.svelte';

	// Components
	import DropDown from './DropDown.svelte';
	import Fields from '@components/collectionDisplay/Fields.svelte';

	// Types
	import type { FieldType } from '.';

	// Utils
	import { createEntry, getData, updateEntry } from '@utils/apiClient';
	import { extractData, getFieldName } from '@utils/utils';

	// Valibot validation
	import * as v from 'valibot';

	interface Props {
		field: FieldType;
		expanded?: boolean;
	}

	let { field, expanded = $bindable(false) }: Props = $props();

	const fieldName = getFieldName(field);
	const value = collectionValue.value[fieldName];
	const relationCollection = collections.value[field?.relation];

	// State variables
	let dropDownData = $state<any[]>([]);
	let selected = $state<{ display: any; _id: any } | undefined>(undefined);
	let fieldsData = $state<Record<string, any>>({});
	let showDropDown = $state(false);
	let entryMode = $state<'create' | 'edit' | 'choose'>('choose');
	let relation_entry = $state<Record<string, any> | undefined>(undefined);
	let validationError = $state<string | null>(null);
	let debounceTimeout: number | undefined;
	let display = $state('');

	// Define the validation schema for the relation widget
	const widgetSchema = v.object({
		_id: v.optional(v.string()),
		display: v.optional(v.pipe(v.string(), v.minLength(1, 'Selection is required')))
	});

	// Extract and display data
	$effect(() => {
		if (!field) return;

		async function updateDisplay() {
			let data: any;
			if (mode.value === 'edit') {
				if (entryMode === 'edit' || entryMode === 'create') {
					data = await extractData(fieldsData);
				} else if (entryMode === 'choose') {
					if (typeof value === 'string') {
						const result = await getData({
							collectionId: String(relationCollection?._id || ''),
							filter: JSON.stringify({ _id: value }),
							limit: 1
						});
						data = result.entryList[0];
					} else {
						data = value;
					}
				}
				if (!relation_entry) relation_entry = data;
			} else {
				data = await extractData(fieldsData);
			}

			data = data[field.displayPath] ? data : value;
			data = mode.value === 'create' ? {} : data;

			const displayResult = await field?.display({
				data,
				field,
				collection: $collection,
				entry: collectionValue.value,
				contentLanguage: $contentLanguage
			});

			display = displayResult || '';
		}

		updateDisplay();
	});

	// Validate when selected changes
	$effect(() => {
		if (selected !== undefined) {
			validateInput();
		}
	});

	// Generic validation function that uses the provided schema to validate the input
	function validateSchema(schema: typeof widgetSchema, data: any): string | null {
		try {
			v.parse(schema, data);
			validationStore.clearError(fieldName);
			return null; // No error
		} catch (error) {
			if (error instanceof v.ValiError) {
				const errorMessage = error.issues[0]?.message || 'Invalid input';
				validationStore.setError(fieldName, errorMessage);
				return errorMessage;
			}
			return 'Invalid input';
		}
	}

	// Validate the input using the generic validateSchema function with debounce
	function validateInput() {
		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = window.setTimeout(() => {
			validationError = validateSchema(widgetSchema, {
				_id: selected?._id,
				display: selected?.display
			});
		}, 300);
	}

	async function openDropDown() {
		if (!field) return;
		const result = await getData({
			collectionId: String(field.relation || ''),
			limit: 10
		});
		dropDownData = result.entryList;
		showDropDown = true;
		entryMode = 'choose';
	}

	function save() {
		expanded = false;
		saveFunction.value.reset();
		validateInput();
	}

	export const WidgetData = async () => {
		let relation_id = '';
		if (!field || !relationCollection?._id) return;
		const collectionId = relationCollection._id;

		try {
			if (entryMode === 'create') {
				const result = await createEntry(collectionId, fieldsData);
				if (result.success && result.data) {
					relation_id = (result.data as { _id: string })._id;
				}
			} else if (entryMode === 'choose') {
				relation_id = selected?._id || '';
			} else if (entryMode === 'edit' && relation_entry?._id) {
				const result = await updateEntry(collectionId, relation_entry._id, { ...fieldsData, _id: relation_entry._id });
				if (result.success && result.data) {
					relation_id = (result.data as { _id: string })._id;
				}
			}

			validateInput();
			return validationError ? null : relation_id;
		} catch (error) {
			console.error('Error in WidgetData:', error);
			return null;
		}
	};

	// Cleanup on destroy
	onDestroy(() => {
		if (debounceTimeout) clearTimeout(debounceTimeout);
	});
</script>

<div class="input-container relative mb-4">
	{#if !expanded && !showDropDown}
		<div class="relative mb-1 flex w-screen min-w-[200px] max-w-full items-center justify-start gap-0.5 rounded border py-1 pl-10 pr-2">
			<button class="flex-grow text-center dark:text-primary-500" onclick={openDropDown} aria-haspopup="listbox" aria-expanded={showDropDown}>
				{@html selected?.display || display || 'select new'}
			</button>

			<div class="ml-auto flex items-center pr-2">
				{#if mode.value === 'create'}
					<button
						onclick={() => {
							expanded = !expanded;
							entryMode = 'create';
							fieldsData = {};
							selected = undefined;
							relation_entry = {};
						}}
						aria-label="Create new relation"
						class="btn-icon"
					>
						<iconify-icon icon="icons8:plus" width="30" class="dark:text-primary-500"></iconify-icon>
					</button>
				{/if}
				<button
					onclick={() => {
						expanded = !expanded;
						entryMode = 'edit';
						fieldsData = {};
						selected = undefined;
					}}
					aria-label="Edit relation"
					class="btn-icons"
				>
					<iconify-icon icon="mdi:pen" width="28" class="dark:text-primary-500"></iconify-icon>
				</button>
			</div>
		</div>
	{:else if !expanded && showDropDown}
		<DropDown {dropDownData} {field} bind:selected bind:showDropDown />
	{:else}
		<Fields fields={relationCollection?.fields} root={false} customData={relation_entry} />
		{(($saveFunction.fn = save), '')}
	{/if}

	<!-- Error Message -->
	{#if validationError}
		<p id={`${field.db_fieldName}-error`} class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500" role="alert">
			{validationError}
		</p>
	{/if}
</div>

<style lang="postcss">
	.input-container {
		min-height: 2.5rem;
	}

	/* .error {
		border-color: rgb(239 68 68);
	} */
</style>
