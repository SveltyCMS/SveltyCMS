<script lang="ts">
	export let field: any = undefined;
	export let value = '';

	export let widgetValue;
	$: widgetValue = value;
</script>

<div class="form-check">
	<input
		bind:value
		class="form-check-input float-left mt-1 mr-2 h-4 w-4 cursor-pointer appearance-none rounded-full border border-surface-300 bg-white bg-contain bg-center bg-no-repeat align-top transition duration-200 checked:border-tertiary-600 checked:bg-tertiary-600 focus:outline-none"
		type="radio"
		name="flexRadioDefault"
		id="flexRadioDefault2"
		checked
		color={field.color}
	/>
	<label class="form-check-label inline-block " for="flexRadioDefault2">
		{field.db_fieldName}
	</label>
</div>
