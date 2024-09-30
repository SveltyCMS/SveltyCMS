<!-- 
@file src/components/widgets/megaMenu/MegaMenu.svelte
@description - MegaMenu widget
-->

<script lang="ts">
	// Stores
	import { saveFunction, translationProgress, shouldShowNextButton, validationStore } from '@stores/store';
	import { collectionValue, mode } from '@stores/collectionStore';

	// Components
	import Fields from '@components/Fields.svelte';
	import ListNode from './ListNode.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	import { currentChild, type FieldType } from '.';
	import { extractData, getFieldName } from '@utils/utils';

	export let field: FieldType;
	const fieldName = getFieldName(field);

	$translationProgress.show = false;

	export let value = $collectionValue[fieldName];
	export const WidgetData = async () => _data;

	let MENU_CONTAINER: HTMLUListElement;
	let showFields = false;
	let depth = 0;
	let _data: { [key: string]: any; children: any[] } = $mode === 'create' ? null : value;
	let fieldsData = {};
	const saveMode = $mode;
	let validationError: string | null = null;

	// Validation schema for each menu layer
	import * as z from 'zod';

	const widgetSchema = z.object({
		name: z.string().min(1, 'Menu name is required'),
		children: z.array(z.any()).optional()
	});

	// Generic validation function that uses the provided schema to validate the input
	function validateSchema(schema: z.ZodSchema, data: any): string | null {
		try {
			schema.parse(data);
			validationStore.clearError(fieldName);
			return null; // No error
		} catch (error) {
			if (error instanceof z.ZodError) {
				const errorMessage = error.errors[0]?.message || 'Invalid input';
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
			} else if ($mode === 'edit') {
				for (const key in _fieldsData) {
					$currentChild[key] = _fieldsData[key];
				}
			} else if ($mode === 'create' && $currentChild.children) {
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
</script>

{#if !_data}
	<p class="text-center font-bold text-tertiary-500">
		{m.widget_megamenu_title()}
	</p>
{/if}

<!-- First Menu Entry -->
{#if !_data || showFields}
	{#key depth}
		{(fieldsData = {}) && ''}
		<Fields
			fields={field.fields[depth]}
			root={false}
			bind:fieldsData
			customData={$currentChild}
			aria-invalid={!!validationError}
			aria-describedby={validationError ? `${fieldName}-error` : undefined}
		/>
	{/key}
	{(($saveFunction.fn = saveLayer), '')}
{/if}

<!-- Show children -->
{#if _data}
	<ul bind:this={MENU_CONTAINER} class:hidden={depth != 0} class="children MENU_CONTAINER">
		<div class="w-screen"></div>
		<ListNode {MENU_CONTAINER} self={_data} bind:depth bind:showFields maxDepth={field.fields.length} />
	</ul>
{/if}

<!-- Error Message -->
{#if validationError}
	<p id={`${fieldName}-error`} class="text-center text-sm text-error-500">
		{validationError}
	</p>
{/if}
