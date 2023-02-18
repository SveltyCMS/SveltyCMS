<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import Icon from '@iconify/svelte';
	import z from 'zod';

	const inputSchemas = z.object({
		name: z
			.string({ required_error: 'Required Name' })
			.min(3, 'Name must be at least 2 characters')
			.max(18, 'Name must be at most 18 characters'),
		email: z.string({ required_error: 'Required Email' }).email('Invalid email'),
		phone: z
			.string()
			.regex(/^\d{10}$/, 'Phone number must be 10 digits')
			.optional(),
		address: z.string().min(10, 'Address must be at least 10 characters')
	});

	const totalInputFields = inputSchemas._getCached().keys;
	const schemaLength = totalInputFields.length;

	let name = '';
	let email = '';
	let phone = '';
	let address = '';

	let progress: number = 0;
	let submitDisabled = true;
	let errors: any = [];
	let displayErrors: any = {};

	console.log(progress);

	const dispatch = createEventDispatcher();

	function calculateProgressAndValidate() {
		const data = { name, email, phone, address };
		const result = inputSchemas.safeParse(data);
		if (result.success === false) {
			submitDisabled = true;
			errors = result.error.issues;
			//console.log('errors----->', errors);
			progress = ((schemaLength - errors.length) * 100) / schemaLength;
		} else {
			//console.log(result.data);
			submitDisabled = false;
			progress = 100;
		}
	}

	function handleInput(e: any) {
		if (progress < 100) {
			progress = progress + 2;
		}
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
		const timeOut = setTimeout(() => {
			calculateProgressAndValidate();
		}, 2000);

		dispatch('input', { name, email, phone, address });
	}

	function handleSubmit(e: any) {
		e.preventDefault();
		console.log('Form submitted:');
		console.log(`Name: ${name}`);
		console.log(`Email: ${email}`);
		console.log(`Phone: ${phone}`);
		console.log(`Address: ${address}`);
	}
	console.log('error', errors);

	onMount(() => {
		calculateProgressAndValidate();
	});
</script>

<h2 class="">Smart Form</h2>
<div class="text-center text-xs text-error-500">* Required</div>
<form on:submit={handleSubmit}>
	<label>
		Name:<span class="pl-1 text-error-500">*</span>
		<input
			type="text"
			required
			name="name"
			bind:value={name}
			on:input={handleInput}
			class="input"
			on:blur={() => {
				const nameError = errors.length && errors.find((e) => e.path.includes('name'));
				if (nameError) {
					displayErrors['name'] = nameError.message;
				}
			}}
		/>
		{#if displayErrors['name']}
			<p class="error !text-sm">{displayErrors['name']}</p>
		{/if}
	</label>

	<label>
		Email:<span class="pl-1 text-error-500">*</span>
		<input
			class="input"
			type="email"
			required
			name="email"
			bind:value={email}
			on:input={handleInput}
			on:blur={() => {
				const nameError = errors.length && errors.find((e) => e.path.includes('email'));
				if (nameError) {
					displayErrors['email'] = nameError.message;
				}
			}}
		/>
		{#if displayErrors['email']}
			<p class="error !text-sm">{displayErrors['email']}</p>
		{/if}
	</label>

	<label>
		Phone:
		<input
			class="input"
			type="tel"
			name="phone"
			bind:value={phone}
			on:input={handleInput}
			on:blur={() => {
				const nameError = errors.length && errors.find((e) => e.path.includes('phone'));
				if (nameError) {
					displayErrors['phone'] = nameError.message;
				}
			}}
		/>
		{#if displayErrors['phone']}
			<p class="error !text-sm">{displayErrors['phone']}</p>
		{/if}
	</label>

	<label>
		Address:
		<input
			class="input"
			type="text"
			name="address"
			bind:value={address}
			on:input={handleInput}
			on:blur={() => {
				const nameError = errors.length && errors.find((e) => e.path.includes('address'));
				if (nameError) {
					displayErrors['address'] = nameError.message;
				}
			}}
		/>
		{#if displayErrors['address']}
			<p class="error !text-sm">{displayErrors['address']}</p>
		{/if}
	</label>

	<div class="mt-3 flex items-center justify-between">
		<button
			type="submit"
			class="relative w-full max-w-[150px] h-[50px] rounded-lg bg-gradient-to-br from-primary-400 via-primary-500 to-primary-600 px-4 py-2 font-bold hover:bg-primary-500 focus:bg-primary-500 active:bg-primary-600 md:mt-2 md:max-w-[350px]"
			disabled={submitDisabled}
		>
			<!--{#if (!progress = 0) }-->
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
						<div class="p-[1.7px] rounded-full variant-filled-surface text-[9px]">
							{progress}%
						</div>
					</div>
				</div>
			<!--{:else}-->
			<!--	<div class="flex items-center justify-center text-xl uppercase">-->
			<!--		<Icon icon="ph:floppy-disk-back" color="dark" width="30" class="mr-1" />-->
			<!--		Save-->
			<!--	</div>-->
			<!--{/if}-->
		</button>
	</div>
</form>

<style lang="postcss">
	.valid {
		color: green;
	}
	.error {
		color: red;
	}
</style>
