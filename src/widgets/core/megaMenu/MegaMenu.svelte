<!-- 
@file src/widgets/core/megaMenu/MegaMenu.svelte
@component
**MegaMenu widget component to create a mega menu with nested structure and drag-and-drop functionality**

@example
<MegaMenu label="MegaMenu" db_fieldName="megaMenu" required={true} />

### Props
- `field`: FieldType
- `value`: any

### Features
- Translatable
-->

<script lang="ts">
	// Stores
	import { saveFunction, translationProgress, shouldShowNextButton, validationStore } from '@stores/store.svelte';
	import { collectionValue, mode } from '@root/src/stores/collectionStore.svelte';

	// Components
	import Fields from '@components/Fields.svelte';
	import ListNode from './ListNode.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	import { currentChild, type FieldType } from '.';
	import { extractData, getFieldName } from '@utils/utils';
	import type { Field } from '@src/content/types';
	// Validation schema for each menu layer
	import * as v from 'valibot';

	interface Props {
		field: FieldType;
		value?: any;
	}

	let { field, value = collectionValue()[getFieldName(field)] }: Props = $props();
	const fieldName = getFieldName(field);

	translationProgress.update((current) => ({ ...current, show: false }));

	export const WidgetData = async () => _data;

	let MENU_CONTAINER: HTMLUListElement = $state();
	let showFields = $state(false);
	let depth = $state(0);
	let _data: { [key: string]: any; children: any[] } = $state(mode.value === 'create' ? null : value);
	let fieldsData = $state({});
	const saveMode = mode.value;
	let validationError: string | null = $state(null);

	const widgetSchema = v.object({
		name: v.pipe(v.string(), v.minLength(1, 'Menu name is required')),
		children: v.optional(v.array(v.any()))
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

	// Validate the current layer
	function validateInput(data: any) {
		validationError = validateSchema(widgetSchema, data);
	}

	// MegaMenu Save Layer Next
	async function saveLayer() {
		const _fieldsData = await extractData(fieldsData);

		validateInput(_fieldsData);

		if (!validationError) {
			if (!_data) {
				_data = { ..._fieldsData, children: [] };
			} else if (mode.value === 'edit') {
				for (const key in _fieldsData) {
					$currentChild[key] = _fieldsData[key];
				}
			} else if (mode.value === 'create' && $currentChild.children) {
				$currentChild.children.push({ ..._fieldsData, children: [] });
			}
			_data = _data;
			showFields = false;
			mode.set(saveMode);
			depth = 0;
			shouldShowNextButton.set(false);
			$saveFunction.reset();
		}
	}

	// Transform fields to match Field type
	function transformFields(fields: any[]): Field[] {
		return fields.map((f) => ({
			...f,
			type: f.widget.Name,
			config: f.widget
		}));
	}

	let currentFields = $derived(field.fields[depth] ? transformFields(field.fields[depth]) : []);
</script>

<div class="menu-container relative mb-4">
	{#if !_data}
		<p class="text-center font-bold text-tertiary-500">
			{m.widget_megamenu_title()}
		</p>
	{/if}

	<!-- First Menu Entry -->
	{#if !_data || showFields}
		<div class:error={!!validationError}>
			{#key depth}
				{(fieldsData = {}) && ''}
				<Fields
					fields={currentFields}
					root={false}
					bind:fieldsData
					customData={$currentChild}
					ariaInvalid={!!validationError}
					ariaDescribedby={validationError ? `${fieldName}-error` : undefined}
				/>
			{/key}
			{(($saveFunction.fn = saveLayer), '')}
		</div>
	{/if}

	<!-- Show children -->
	{#if _data}
		<ul bind:this={MENU_CONTAINER} class:hidden={depth != 0} class="children MENU_CONTAINER" class:error={!!validationError}>
			<div class="w-screen"></div>
			<ListNode {MENU_CONTAINER} self={_data} bind:depth bind:showFields maxDepth={field.fields.length} />
		</ul>
	{/if}

	<!-- Error Message -->
	{#if validationError}
		<p id={`${fieldName}-error`} class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500" role="alert">
			{validationError}
		</p>
	{/if}
</div>

<style lang="postcss">
	.menu-container {
		min-height: 2.5rem;
	}

	.error {
		border-color: rgb(239 68 68);
	}
</style>
