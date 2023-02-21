<script lang="ts">
	import Fields from '$src/components/Fields.svelte';
	import { shape_fields } from '$src/lib/utils/utils_svelte';
	import { entryData, MenuCurrentChild } from '$src/stores/store';

	import ListNode from './ListNode.svelte';
	import Icon from '@iconify/svelte';
	export let field: any;
	export let value: any = {};
	export let root = true;
	let fieldsValue = {};

	let editing = false;
	let menu = field.menu;
	let showLevelContent = false;
	let depth = 0;
	let inputFields: Array<HTMLDivElement> = [];
	MenuCurrentChild.subscribe((_) => {
		value = value; // refresh tree when editing/deleting
	});

	let fields: any;
	$: shape_fields(menu[depth].fields).then((data) => (fields = data));

	let getData = async () => {
		if (!showLevelContent && !editing) {
			return;
		}
		let data: any = fieldsValue;

		let formData: any = {};
		if (depth == 0 && !editing) {
			//creating parent
			data.children = [];
			data = JSON.stringify(data);
			formData[field.db_fieldName] = data;
		} else {
			!Array.isArray($MenuCurrentChild.children) && ($MenuCurrentChild.children = []);
			if (editing) {
				//editing child
				for (let key in data) {
					$MenuCurrentChild[key] = data[key];
				}
			} else {
				data = JSON.stringify(data); //adding children to child
				$MenuCurrentChild.children.push(data);
			}
			formData[field.db_fieldName] = JSON.stringify(value);
		}
		if (root) return formData;
	};
</script>

<div hidden={showLevelContent}>
	<ul class="menu rounded-md bg-white text-black">
		{#if !value}
			<li>
				<div>
					<button
						on:click={() => {
							(depth = 0), (showLevelContent = !showLevelContent);
						}}
						class="variant-filled-primary btn btn-sm ml-auto rounded text-xl text-black"
					>
						<Icon icon="ic:baseline-plus" width="22" />
					</button>
				</div>
			</li>
		{:else}
			<ListNode
				children={value.children}
				self={value}
				bind:editing
				bind:showLevelContent
				bind:depth
			/>
		{/if}
	</ul>
</div>
{#if showLevelContent}
	<div
		class="relative my-4 rounded-lg border-2 border-[#8cccff] p-[20px]"
		hidden={!showLevelContent}
	>
		<button
			on:click={() => {
				showLevelContent = !showLevelContent;
				editing = false;
				fieldsValue = {};
			}}
			class="btn btn-sm absolute top-0 right-0 z-10 mb-2 dark:text-white"
		>
			<Icon icon="material-symbols:close" width="26" />
		</button>
		<Fields
			bind:fieldsValue
			bind:inputFields
			root={false}
			value={editing ? $MenuCurrentChild : null}
			{fields}
			{getData}
		/>
	</div>
{/if}
