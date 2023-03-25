<script lang="ts">
	import Fields from '$src/components/Fields.svelte';

	export let field = { db_fieldName: '', fields: [] };
	export let collection: any;
	export let value: any;

	let _fieldsValue: any = [];
	let fields: any;

	import * as z from 'zod';

	var widgetValueObject = {
		db_fieldName: field.db_fieldName,
		fields: field.fields
	};

	const ConditionSchema = z.object({
		db_fieldName: z.string(),
		fields: z.array(z.any())
	});

	let validationError: string | null = null;

	$: validationError = (() => {
		try {
			ConditionSchema.parse(widgetValueObject);
			return null;
		} catch (error) {
			return (error as Error).message;
		}
	})();
</script>

<div class="flex flex-wrap  justify-between">add condition here</div>
{#if validationError !== null}
	<p class="text-red-500">{validationError}</p>
{/if}
