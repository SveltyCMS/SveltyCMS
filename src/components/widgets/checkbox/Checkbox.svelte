<script lang="ts">
	export let field: any = undefined;
	export let value = '';

	export let widgetValue;
	$: widgetValue = value;
</script>

<div class="mb-4 flex items-center">
	<input
		id="default-checkbox"
		type="checkbox"
		color={field.color}
		bind:value
		class="h-4 w-4 rounded border-surface-300 bg-surface-100 text-tertiary-600 focus:ring-2 focus:ring-tertiary-500 dark:border-surface-600 dark:bg-surface-700 dark:ring-offset-surface-800 dark:focus:ring-tertiary-600"
	/>
	<label
		for="default-checkbox"
		class="ml-2 text-sm font-medium text-surface-900 dark:text-surface-300"
		>{field.db_fieldName}</label
	>
</div>
