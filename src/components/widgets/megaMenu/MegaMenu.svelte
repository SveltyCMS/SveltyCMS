<script lang="ts">
	// Stores
	import { entryData, mode, saveFunction, saveLayerStore, shouldShowNextButton } from '@stores/store';

	// Components
	import Fields from '@components/Fields.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	import { currentChild, type FieldType } from '.';
	import { extractData, getFieldName } from '@utils/utils';

	import ListNode from './ListNode.svelte';

	export let field: FieldType;
	let fieldName = getFieldName(field);
	console.log(field);

	export let value = $entryData[fieldName];
	export const WidgetData = async () => _data;

	let showFields = false;
	let depth = 0;
	let _data: { [key: string]: any; children: any[] } = $mode == 'create' ? null : value;
	let fieldsData = {};
	let saveMode = $mode;

	// Create a writable store to hold the saveLayer function
	saveLayerStore.set(saveLayer);
	// Set the value of shouldTriggerSaveLayer based on your condition
	shouldShowNextButton.set(true);

	// MegaMenu Save Layer Next
	async function saveLayer() {
		if (!_data) {
			_data = { ...(await extractData(fieldsData)), children: [] };
		} else if ($mode == 'edit') {
			let _data = await extractData(fieldsData);
			for (let key in _data) {
				$currentChild[key] = _data[key];
			}
		} else if ($mode == 'create' && $currentChild.children) {
			$currentChild.children.push({ ...(await extractData(fieldsData)), children: [] });
		}
		_data = _data;
		console.log(_data);
		showFields = false;
		mode.set(saveMode);
		depth = 0;
		shouldShowNextButton.set(false);
		$saveFunction.reset();
	}
	function handleKeyDown(event) {
		console.log('handleKeyDown called');
		if (event.key === 'Enter') {
			console.log('Enter key pressed');
			let next = () => {};
			saveLayerStore.subscribe((value) => {
				next = value;
				shouldShowNextButton.set(false);
			});
		}
	}
</script>

{#if !_data}
	<p class="text-center font-bold text-tertiary-500">
		{m.widget_megamenu_title()}
	</p>
{/if}

<!-- First Menu Entry -->
<!-- TODO Fix ON:keyDOWN -->
{#if !_data || showFields}
	{#key depth}
		{(fieldsData = {}) && ''}
		<Fields fields={field.menu[depth]} root={false} bind:fieldsData customData={$currentChild} on:keydown={handleKeyDown} />
	{/key}
	{(($saveFunction.fn = saveLayer), '')}
{/if}

<!-- Show children -->
{#if _data}
	<ul class:hidden={depth != 0} class="children MENU_CONTAINER">
		<ListNode self={_data} bind:depth bind:showFields maxDepth={field.menu.length} />
	</ul>
{/if}
