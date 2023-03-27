<script lang="ts">
	import Fields from '$src/components/Fields.svelte';
	import { shape_fields } from '$src/lib/utils/utils_svelte';

	export let field = { db_fieldName: '', fields: [] };
	export let collection: any;
	export let value: any;

	let _fieldsValue: any = [];
	let fields: any;

	shape_fields(field.fields).then((data) => (fields = data));

	import * as z from 'zod';

	var widgetValueObject = {
		db_fieldName: field.db_fieldName,
		fields: field.fields
	};

	const groupSchema = z.object({
		db_fieldName: z.string(),
		fields: z.array(z.any())
	});

	let validationError: string | null = null;

	$: validationError = (() => {
		try {
			groupSchema.parse(widgetValueObject);
			return null;
		} catch (error) {
			return (error as Error).message;
		}
	})();
</script>

<div class="flex flex-wrap justify-between">
	<Fields {collection} {fields} bind:fieldsValue={_fieldsValue} {value} />
</div>
{#if validationError !== null}
	<p class="text-red-500">{validationError}</p>
{/if}
