<script lang="ts">
	export let field: any = undefined;
	export let value = '';

	export let widgetValue;
	$: widgetValue = value;

	let isEmailValid = true;
	let emailRegex =
		/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
	function validateEmail(e) {
		if (!emailRegex.test(e.target.value)) {
			isEmailValid = false;
		} else {
			isEmailValid = true;
		}
	}
</script>

<input
	bind:value
	type="email"
	id="email"
	placeholder={field.placeholder && field.placeholder !== ''
		? field.placeholder
		: field.db_fieldName}
	class="input"
	on:input={validateEmail}
/>

{#if !isEmailValid}
	<p class="text-red-500">Please enter a valid email address.</p>
{/if}
