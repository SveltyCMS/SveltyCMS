<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import Icon from '@iconify/svelte';
	import z from 'zod';

	const inputSchemas = z.object({
		name: z
			.string()
			.min(2, 'Name must be at least 2 characters')
			.max(18, 'Name must be at most 18 characters'),
		email: z.string().email('Invalid email'),
		phone: z
			.string()
			.regex(/^\d{10}$/, 'Phone number must be 10 digits')
			.optional(),
		address: z.string().min(10, 'Address must be at least 10 characters')
	});

	let name = '';
	let email = '';
	let phone = '';
	let address = '';

	let progress = 0;

	const dispatch = createEventDispatcher();

	function calculateProgressAndValidate() {
		let fieldsWithContent = 0;
		let requiredFieldsWithContent = 0;
		let validatedFieldsWithContent = 0;

		const inputFields = ['name', 'email', 'phone', 'address'];

		for (let i = 0; i < inputFields.length; i++) {
			const inputField: any = inputFields[i];
			const inputValue = eval(inputField);

			if (inputValue && inputValue.length > 0) {
				fieldsWithContent++;

				if (inputSchemas[inputField]) {
					try {
						inputSchemas[inputField].validate(inputValue);
						requiredFieldsWithContent++;
						validatedFieldsWithContent++;
					} catch (error) {
						// Do nothing
					}
				}
			}
		}

		const optionalFieldsWithContent = fieldsWithContent - requiredFieldsWithContent;
		const requiredFieldsPercent = requiredFieldsWithContent * (80 / inputFields.length);
		const optionalFieldsPercent = optionalFieldsWithContent * (20 / inputFields.length);
		const validatedFieldsPercent = validatedFieldsWithContent * (25 / inputFields.length);

		progress = Math.floor(optionalFieldsPercent + requiredFieldsPercent + validatedFieldsPercent);

		if (progress > 100) {
			progress = 100;
		}
	}

	function handleInput(e) {
		switch (e.target.name) {
			case 'name':
				name = e.target.value;
				break;
			case 'email':
				email = e.target.value;
				break;
			case 'phone':
				phone = e.target.value;
				break;
			case 'address':
				address = e.target.value;
				break;
		}
		calculateProgressAndValidate();
		dispatch('input', { name, email, phone, address });
	}

	function handleSubmit(e) {
		e.preventDefault();
		console.log('Form submitted:');
		console.log(`Name: ${name}`);
		console.log(`Email: ${email}`);
		console.log(`Phone: ${phone}`);
		console.log(`Address: ${address}`);
	}

	onMount(() => {
		calculateProgressAndValidate();
	});

	console.log(progress);
</script>

<form on:submit={handleSubmit}>
	<label>
		Name:
		<input class="input" type="text" name="name" bind:value={name} on:input={handleInput} />
		<!-- {#if error.name}
			<p class="error">{error.name}</p>
		{/if} -->
	</label>

	<label>
		Email:
		<input class="input" type="email" name="email" bind:value={email} on:input={handleInput} />
		<!-- {#if error.email}
			<p class="error">{error.email}</p>
		{/if} -->
	</label>

	<label>
		Phone:
		<input class="input" type="tel" name="phone" bind:value={phone} on:input={handleInput} />
		<!-- {#if error.phone}
			<p class="error">{error.phone}</p>
		{/if} -->
	</label>

	<label>
		Address:
		<input class="input" type="text" name="address" bind:value={address} on:input={handleInput} />
		<!-- {#if error.address}
			<p class="error">{error.address}</p>
		{/if} -->
	</label>

	<div class="mt-3 flex items-center justify-between">
		<button
			type="submit"
			class="relative w-full max-w-[150px] h-[50px] rounded-lg bg-gradient-to-br from-primary-400 via-primary-500 to-primary-600 px-4 py-2 font-bold hover:bg-primary-500 focus:bg-primary-500 active:bg-primary-600 md:mt-2 md:max-w-[350px]"
		>
			<div
				class="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center text-xl uppercase"
			>
				<Icon icon="ph:floppy-disk-back" color="dark" width="30" class="mr-1" />
				Save
			</div>

			<div class="relative mx-auto mt-[27px] h-2 w-[90%] rounded-full bg-surface-500 px-4">
				<div
					class="absolute bottom-0 left-0 mt-4 h-2 w-full rounded bg-tertiary-500"
					style="width: {progress}%"
				/>
				<div class="absolute top-0 left-0 flex h-full w-full items-center justify-center ">
					<div class="p-[1.5px] rounded-full border border-white variant-filled-surface text-[9px]">
						{progress}%
					</div>
				</div>
			</div>
		</button>
	</div>
</form>

<style>
	.valid {
		color: green;
	}
</style>
