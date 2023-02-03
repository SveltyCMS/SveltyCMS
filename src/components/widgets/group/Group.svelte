<script lang="ts">
	import Fields from '$src/components/Fields.svelte';
	import { shape_fields } from '$src/lib/utils/utils_svelte';

	export let field = { db_fieldName: '', fields: [] };
	export let collection: any;
	export let value: any;

	let _fieldsValue: any = [];
	let fields: any;

	shape_fields(field.fields).then((data) => (fields = data));
</script>

<div class="flex flex-wrap  justify-between">
	<Fields {collection} {fields} bind:fieldsValue={_fieldsValue} {value} />
</div>
