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
	let _data: { [key: string]: any; children: any[] } | null = $mode == 'create' ? null : value;
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
		showFields = false;
		mode.set(saveMode);
		depth = 0;
	}

	async function deleteLayer() {
		console.log('$mode:', $mode);
		console.log('_data:', _data);


		if ($mode == 'edit') {
			if (_data !== null) {
				let index = _data.children.indexOf($currentChild);
				console.log('index:', index);

				if (index !== -1) {
					_data.children.splice(index, 1);
				}
			}
		}
		_data = null;
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

{#if !_data || showFields}
	<!-- TODO: fix save on enter  on:keydown={saveLayer} -->
	{#key depth}
		{(fieldsData = {}) && ''}
		<Fields fields={field.menu[depth].fields} root={false} bind:fieldsData customData={$currentChild} />
	{/key}

	<div class="flex items-center justify-between">
		<!-- Next Button -->
		<button type="button" on:click={saveLayer} class="variant-filled-primary btn mb-4 dark:text-white">
			<iconify-icon icon="carbon:next-filled" width="24" class="mr-1 dark:text-white" />
			{$LL.WIDGET_MegaMenu_Next()}
		</button>

		{#if _data}
			<!-- remove/delete Button -->
			<button type="button" on:click={deleteLayer} class="variant-filled-error btn mb-4 dark:text-white">
				<iconify-icon icon="mdi:trash-can-outline" width="24" class="mr-1 dark:text-white" />
				Remove
			</button>
		{/if}
	</div>
{/if}

<!-- Show children -->
{#if _data && depth == 0}
<ListNode isFirstHeader={true} self={_data} parent={null} bind:depth bind:showFields maxDepth={field.menu.length} />
{/if}
