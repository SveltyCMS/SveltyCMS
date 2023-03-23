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

	import * as z from 'zod';

	var widgetValueObject = {
		db_fieldName: field.db_fieldName,
		icon: field.icon,
		placeholder: field.placeholder,
		localization: field.localization,
		required: field.required
	};

	const emailSchema = z.object({
		db_fieldName: z.string(),
		icon: z.string().optional(),
		placeholder: z.string().optional(),
		localization: z.boolean().optional(),
		required: z.boolean().optional()
	});

	let validationError: string | null = null;

	$: validationError = (() => {
		try {
			emailSchema.parse(widgetValueObject);
			return null;
		} catch (error) {
			return (error as Error).message;
		}
	})();
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
{#if validationError !== null}
	<p class="text-red-500">{validationError}</p>
{/if}
