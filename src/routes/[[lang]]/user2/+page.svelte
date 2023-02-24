<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import Icon from '@iconify/svelte';
	import z from 'zod';
	import { updateUser2Errors, user2Errors } from '$src/stores/user2Form';
	import { get } from 'svelte/store';

	const inputSchemas = z.object({
		name: z
			.string({ required_error: 'Required Name' })
			.min(3, 'Name must be at least 2 characters')
			.max(18, 'Name must be at most 18 characters'),
		email: z.string({ required_error: 'Required Email' }).email('Invalid email'),
		phone: z
			.string()
			// .regex(/^\d{10}$/, 'Phone number must be 10 digits')
			.regex(/^(\+\d{1,2}\s)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}$/, 'Phone number must be 10 digits')

			.optional(),
		address: z.string().min(10, 'Address must be at least 10 characters').optional()
	});

	const totalInputFields = inputSchemas._getCached().keys;
	const schemaLength = totalInputFields.length;

	let name = '';
	let email = '';
	let phone = '';
	let address = '';

	let progress = 0;
	let submitDisabled = true;
	let displayErrors: any = {};
	let touched: { [key: string]: boolean } = {};

	let errors: any = get(user2Errors);
	user2Errors.subscribe((errors: z.ZodIssue[]) => {
		let dErrors: { [key: string]: string } = {};
		errors.forEach((error) => {
			const name = error.path[0];
			if (touched[name]) {
				dErrors[name] = error.message;
			}
		});
		displayErrors = dErrors;
		progress = ((schemaLength - errors.length) * 100) / schemaLength;
	});

	const dispatch = createEventDispatcher();

	function calculateProgressAndValidate() {
		const data = { name, email, phone, address };
		const result = inputSchemas.safeParse(data);
		if (result.success === false) {
			// submitDisabled = true;
			updateUser2Errors(result.error.issues);
		} else {
			console.log(result.data);
			// submitDisabled = false;
			progress = 100;
		}

		const optionalSafeData: { [key: string]: any } = { name, email };
		if (phone) {
			optionalSafeData.phone = phone;
		}
		if (address) {
			optionalSafeData.address = address;
		}
		submitDisabled = !inputSchemas.safeParse(optionalSafeData).success;
	}

	function handleInput(e: any) {
		if (progress + 1 <= 100) {
			progress = progress + 1;
		}
		switch (e.target.name) {
			case 'name':
				name = e.target.value;
				break;
			case 'email':
				email = e.target.value.toLowerCase();
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

	async function checkUserExists(query: { [key: string]: any }) {
		// const query = { email: 'bhaumikdhameliya30@gmail.com' };
		const res = await fetch(`/api/find?collection=user&query=${JSON.stringify(query)}`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json'
			}
		});
		const data = (await res.json()) as [any];
		return Boolean(data.length);
	}

	async function handleSubmit(e: any) {
		e.preventDefault();
		const isUserExists = await checkUserExists({ email });
		if (isUserExists) {
			alert('email already exists');
			return;
		}

		console.log('Form submitted:');
		console.log(`Name: ${name}`);
		console.log(`Email: ${email}`);
		console.log(`Phone: ${phone}`);
		console.log(`Address: ${address}`);
	}

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
				touched['name'] = true;
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
				touched['email'] = true;
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
				touched['phone'] = true;
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
				touched['address'] = true;
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
			{#if !(progress === 0)}
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
			{:else}
				<div class="flex items-center justify-center text-xl uppercase">
					<Icon icon="ph:floppy-disk-back" color="dark" width="30" class="mr-1" />
					Save
				</div>
			{/if}
		</button>
	</div>
</form>

<style lang="postcss">
	.error {
		color: red;
	}
</style>
