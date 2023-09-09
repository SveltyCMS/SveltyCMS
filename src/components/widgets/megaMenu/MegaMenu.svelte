<script lang="ts">
	import Fields from '@src/components/Fields.svelte';
	import { currentChild, type FieldType } from '.';
	import { extractData, getFieldName } from '@src/utils/utils';

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';

	import ListNode from './ListNode.svelte';
	import { entryData, mode } from '@src/stores/store';

	export let field: FieldType;
	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName];
	export const WidgetData = async () => _data;

	let showFields = false;
	let depth = 0;
	let _data: { [key: string]: any; children: any[] } = $mode == 'create' ? null : value;
	//console.log('MegMenu Data', _data);

	let fieldsData = {};
	let saveMode = $mode;

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
		//console.log('MegMenu Data', _data);
		showFields = false;
		mode.set(saveMode);
		depth = 0;
	}

	async function deleteLayer() {
		// if (!_data) {
		// 	_data = { ...(await extractData(fieldsData)), children: [] };
		// } else if ($mode == 'edit') {
		// 	$currentChild = { ..._data, ...(await extractData(fieldsData)) };
		// 	//console.log($currentChild);
		// } else if ($mode == 'create' && $currentChild.children) {
		// 	$currentChild.children.push({ ...(await extractData(fieldsData)), children: [] });
		// }
		// _data = _data;
		// //console.log('MegMenu Data', _data);
		// showFields = false;
		// mode.set(saveMode);
		// depth = 0;
	}
</script>

{#if !_data}
	<p class="font-bold text-center">
		{$LL.WIDGET_MegaMenu_title()}
	</p>
{/if}

<!-- TODO this should only show on child edit -->
<!-- {#if _data || showFields}
	<p class="font-bold text-center">Enter Categories</p>
	{/if} -->

{#if !_data || showFields}
	<!-- TODO: fix save on enter  on:keydown={saveLayer} -->
	{#key depth}
		{(fieldsData = {}) && ''}
		<Fields
			fields={field.menu[depth].fields}
			root={false}
			bind:fieldsData
			customData={$currentChild}
		/>
	{/key}

	<div class="flex items-center justify-between">
		<!-- Next Button -->
		<button
			type="button"
			on:click={saveLayer}
			class="btn variant-filled-primary dark:text-white mb-4"
		>
			<iconify-icon icon="carbon:next-filled" width="24" class="dark:text-white mr-1" />
			{$LL.WIDGET_MegaMenu_Next()}
		</button>

		{#if _data}
			<!-- remove/delete Button -->
			<button
				type="button"
				on:click={deleteLayer}
				class="btn variant-filled-error dark:text-white mb-4"
			>
				<iconify-icon icon="mdi:trash-can-outline" width="24" class="dark:text-white mr-1" />
				Remove
			</button>
		{/if}
	</div>
{/if}

{#if _data && depth == 0}
	<ListNode self={_data} bind:depth bind:showFields maxDepth={field.menu.length} />
{/if}
