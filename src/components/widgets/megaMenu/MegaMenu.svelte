<script lang="ts">
	import Fields from '@src/components/Fields.svelte';
	import { currentChild, type FieldType } from '.';
	import { extractData, getFieldName } from '@src/utils/utils';

	import ListNode from './ListNode.svelte';
	import { entryData, mode } from '@src/stores/store';

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';

	export let field: FieldType;
	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName];
	export const WidgetData = async () => _data;

	let showFields = false;
	let depth = 0;
	let _data: { [key: string]: any; children: any[] } = $mode == 'create' ? null : value;
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
		console.log(_data);
		showFields = false;
		mode.set(saveMode);
		depth = 0;
	}
</script>

{#if !_data}
	<p class="text-center font-bold text-tertiary-500">
		{$LL.WIDGET_MegaMenu_title()}
	</p>
{/if}

<!-- TODO: add click enter to proceed -->
{#if !_data || showFields}
	{#key depth}
		{(fieldsData = {}) && ''}
		<Fields fields={field.menu[depth]} root={false} bind:fieldsData customData={$currentChild} />
	{/key}

	<div class="flex items-center justify-between">
		<!-- Next Button -->
		<button type="button" on:click={saveLayer} class="variant-filled-primary btn mb-4 dark:text-white">
			<iconify-icon icon="carbon:next-filled" width="24" class="mr-1 dark:text-white" />
			{$LL.WIDGET_MegaMenu_Next()}
		</button>
	</div>
{/if}

<!-- Show children -->
{#if _data && depth == 0}
	<ListNode self={_data} bind:depth bind:showFields maxDepth={field.menu.length} />
{/if}
