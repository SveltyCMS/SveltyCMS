<script lang="ts">
	import Fields from '@components/Fields.svelte';
	import { currentChild, type FieldType } from '.';
	import { extractData, getFieldName } from '@utils/utils';

	import ListNode from './ListNode.svelte';
	import { entryData, mode, saveLayerStore, shouldShowNextButton } from '@stores/store';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	export let field: FieldType;
	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName];
	export const WidgetData = async () => _data;

	let showFields = false;
	let depth = 0;
	let _data: { [key: string]: any; children: any[] } = $mode == 'create' ? null : value;
	let fieldsData = {};
	let saveMode = $mode;

	// Megamenu Save layer Next
	async function saveLayer() {
		if (!_data) {
			const extractedData = await extractData(fieldsData);
			if (Object.keys(extractedData).length > 0) {
				_data = { ...extractedData, children: [] };
			}
		} else if ($mode === 'edit') {
			// Existing logic for editing...
		} else if ($mode === 'create' && $currentChild.children) {
			const extractedData = await extractData(fieldsData);
			if (Object.keys(extractedData).length > 0) {
				$currentChild.children.push({ ...extractedData, children: [] });
			}
		}
		showFields = false;
		mode.set(saveMode);
		depth = 0;
		shouldShowNextButton.set(false);
	}

	// Create a writable store to hold the saveLayer function
	saveLayerStore.set(saveLayer);
	// Set the value of shouldTriggerSaveLayer based on your condition
	shouldShowNextButton.set(true);
</script>

{#if !_data}
	<p class="text-center font-bold text-tertiary-500">
		{m.widget_megamenu_title()}
	</p>
{/if}

<!-- TODO: add click enter to proceed -->
{#if !_data || showFields}
	{#key depth}
		{(fieldsData = {}) && ''}
		<Fields fields={field.menu[depth]} root={false} bind:fieldsData customData={$currentChild} />
	{/key}
{/if}

<!-- Show children -->
{#if _data && depth == 0}
	<ListNode self={_data} bind:depth bind:showFields maxDepth={field.menu.length} />
{/if}
