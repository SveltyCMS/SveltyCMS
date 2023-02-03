<script lang="ts">
	import Fields from '$src/components/Fields.svelte';
	import { saveSimpleData, shape_fields } from '$src/lib/utils/utils_svelte';
	import { entryData } from '$src/stores/store';
	export let field = { title: '', fields: [] };
	export let collection: any;
	export let value: any;

	let _fieldsValue: any = [];
	let fields: any;
	let files: any = [];
	let getData = async () => {
		for (let i = 0; i < files.length; i++) {
			let fieldsData = _fieldsValue[i];
			await saveSimpleData(collection, fieldsData);
		}
		if (!files.length) {
			// if no files currently beeing chosen, means we are editing, should update.
			let fieldsData = _fieldsValue;
			await saveSimpleData(collection, fieldsData);
		}
	};
	shape_fields(field.fields).then((data) => (fields = data));
</script>

{#if files.length > 0}
	{#each files as file, index}
		<div class="sm:p-[20px] p-2 my-4 rounded-lg border-2 border-[#8cccff] relative">
			<Fields
				{getData}
				{collection}
				root={false}
				{fields}
				bind:fieldsValue={_fieldsValue[index]}
				value={{ 'Multi Image Array': file }}
			/>
		</div>
	{/each}
{:else if $entryData}
	<Fields {getData} {collection} {fields} bind:fieldsValue={_fieldsValue} {value} />
{:else}
	<input
		multiple
		bind:files
		name={field.title}
		class="block w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 cursor-pointer dark:text-gray-400 focus:outline-none dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400"
		type="file"
	/>
{/if}

<style>
</style>
