<script lang="ts">
	import { onMount } from 'svelte';
	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	import z from 'zod';
	const userSchema = z.object({
		name: z.string().min(2).max(18),
		email: z.string().email(),
		phone: z.string().min(10).max(14).optional()
	});

	let name = '';
	let email = '';
	let phone = '';

	let progress = 0;
	let valid = false;

	onMount(() => {
		calculateProgress();
	});

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
		}
		calculateProgress();
	}

	function calculateProgress() {
		const user = { name, email, phone };
		try {
			userSchema.array().validate([user]);
			valid = true;
			progress = 100;
		} catch (error) {
			valid = false;
			if (name && email && phone) {
				progress = 100;
			} else if (name && email) {
				progress = 60;
			} else if (name || email) {
				progress = 30;
			} else {
				progress = 0;
			}
		}
	}

	function handleSubmit(e) {
		e.preventDefault();
		console.log('Form submitted:');
		console.log(`Name: ${name}`);
		console.log(`Email: ${email}`);
		console.log(`Phone: ${phone}`);
	}
</script>

<form on:submit|preventDefault={handleSubmit}>
	<div class="mb-4">
		<label class="block text-gray-700 font-medium mb-2" for="name">Name required </label>
		<input
			class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
			type="text"
			id="name"
			name="name"
			bind:value={name}
			on:input={handleInput}
			required
		/>
	</div>

	<div class="mb-4">
		<label class="block text-gray-700 font-medium mb-2" for="email">Email required </label>
		<input
			class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
			type="email"
			id="email"
			name="email"
			bind:value={email}
			on:input={handleInput}
			required
		/>
	</div>

	<div class="mb-4">
		<label class="block text-gray-700 font-medium mb-2" for="phone"> Phone </label>
		<input
			class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
			type="tel"
			id="phone"
			name="phone"
			bind:value={phone}
			on:input={handleInput}
		/>
	</div>

	<div class="flex items-center justify-between">
		<!-- Save button with progressbar -->
		<button
			on:click={() => submit()}
			type="submit"
			disabled={!name || !email}
			class="w-full max-w-[150px] rounded-lg bg-gradient-to-br from-primary-400 via-primary-500 to-primary-600 px-4 py-2 font-bold hover:bg-primary-500 focus:bg-primary-500 active:bg-primary-600 md:mt-2 md:max-w-[350px]"
		>
			<div class=" flex items-center justify-center text-xl uppercase">
				<Icon icon="ph:floppy-disk-back" color="dark" width="30" class="mr-1" />
				Save
			</div>

			<!-- progress bar sidebar-->
			<div
				class="relative mx-auto mt-1 hidden h-2 w-[90%] rounded-full bg-surface-500 px-4 md:block"
			>
				<div
					class="absolute bottom-0 left-0 mt-4 h-2 w-full rounded bg-tertiary-500"
					style="width: {progress}%"
				/>
				<div
					class="absolute top-0 left-0 flex h-full  w-full items-center justify-center text-xs font-bold text-white"
				>
					{progress}%
				</div>
			</div>
		</button>
	</div>
</form>
