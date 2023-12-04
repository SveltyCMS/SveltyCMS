<script lang="ts">
	import { page } from '$app/stores';
	import { roles } from '@src/collections/types';
	import FloatingInput from '@src/components/system/inputs/floatingInput.svelte';
	import { invalidateAll } from '$app/navigation';

	// Props
	/** Exposes parent props to this component. */
	export let parent: any;

	// Skelton & Stores
	import { getModalStore } from '@skeletonlabs/skeleton';

	const modalStore = getModalStore();

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Lucia
	const user = $page.data.user;
	const { isFirstUser } = $page.data;
	export let isGivenData: boolean = false; // to check if data is given or not
	export let username: string | null = null;
	export let email: string | null = null;
	export let role: string | null = null;
	export let userId: string | null = null;

	// Form Data
	const formData = {
		userId: isGivenData ? userId : user?.userId,
		username: isGivenData ? username : user?.username,
		email: isGivenData ? email : user?.email,
		password: '',
		confirmPassword: '',
		role: isGivenData ? role : user?.role
	};

	let showPassword = false;

	let errorStatus = {
		username: { status: false, msg: '' },
		email: { status: false, msg: '' },
		password: { status: false, msg: '' },
		confirm: { status: false, msg: '' }
	};

	// We've created a custom submit function to pass the response and close the modal.
	function onFormSubmit(): void {
		// console.log('modal submitted.');
		if ($modalStore[0].response) $modalStore[0].response(formData);

		if ((isGivenData && userId != user?.userId) || (formData.password !== null && formData.password === formData.confirmPassword)) {
			modalStore.close();
		} else {
			console.log('error');
		}
	}

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4 bg-white';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';

	let formElement: HTMLFormElement;

	const deleteUser = async () => {
		const res = await fetch('/api/user/deleteUsers', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify([{ userId: userId, role: role }])
		});

		if (res.status === 200) {
			await invalidateAll();
		}
	};
</script>

<!-- @component This example creates a simple form modal. -->

<div class="modal-example-form {cBase}">
	<header class={`text-center dark:text-primary-500 ${cHeader}`}>
		{$modalStore[0]?.title ?? '(title missing)'}
	</header>
	<article class="text-center text-sm">
		{$modalStore[0]?.body ?? '(body missing)'}
	</article>
	<!-- Enable for debugging: -->
	<!-- <pre>{JSON.stringify(formData, null, 2)}</pre> -->
	<form class="modal-form {cForm}" bind:this={formElement} id="change_user_form">
		<!-- Username field -->
		<div class="group relative z-0 mb-6 w-full">
			<iconify-icon icon="mdi:user-circle" width="18" class="absolute left-0 top-3.5 text-gray-400" />
			<FloatingInput
				type="text"
				name="username"
				label={m.modaleditform_username()}
				bind:value={formData.username}
				on:keydown={() => (errorStatus.username.status = false)}
				required
				disabled={isGivenData && userId != user?.userId}
			/>
			{#if !errorStatus.username.status}
				<div class="absolute left-0 top-11 text-xs text-error-500">
					{errorStatus.username.msg}
				</div>
			{/if}
		</div>

		<!-- admin area -->
		{#if isGivenData ? role : user?.role == roles.admin}
			<!-- Email field -->
			<div class="group relative z-0 mb-6 w-full">
				<iconify-icon icon="mdi:email" width="18" class="absolute left-0 top-3.5 text-gray-400" />
				<FloatingInput
					type="email"
					name="email"
					label={m.modaleditform_emailaddress()}
					bind:value={formData.email}
					on:keydown={() => (errorStatus.email.status = false)}
					required
					disabled
				/>
				{#if errorStatus.email.status}
					<div class="absolute left-0 top-11 text-xs text-error-500">
						{errorStatus.email.msg}
					</div>
				{/if}
			</div>
		{:else}
			<!-- only show email but normal user cant change it -->
			<div class="group relative z-0 mb-6 w-full">
				<iconify-icon icon="mdi:email" width="18" class="absolute left-0 top-3.5 text-gray-400" />
				<FloatingInput
					type="email"
					name="email"
					label="Email Cannot be changed"
					bind:value={formData.email}
					on:keydown={() => (errorStatus.email.status = false)}
					icon="mdi:email"
					iconColor="white"
					textColor="white"
				/>
				{#if errorStatus.email.status}
					<div class="absolute left-0 top-11 text-xs text-error-500">
						{errorStatus.email.msg}
					</div>
				{/if}
			</div>
		{/if}
		{#if (user?.userId == userId || !isGivenData) && user?.authMethod == 'email'}
			<!-- Password field -->
			<div class="group relative z-0 mb-6 w-full">
				<iconify-icon icon="mdi:password" width="18" class="absolute left-0 top-3.5 text-gray-400" />
				{#if showPassword}
					<FloatingInput
						type="text"
						name="password"
						id="password"
						label={m.modaleditform_newpassword()}
						bind:value={formData.password}
						on:keydown={() => (errorStatus.password.status = false)}
						autocomplete="current-password"
						required
					/>{:else}
					<FloatingInput
						type="password"
						name="password"
						label={m.modaleditform_newpassword()}
						autocomplete="current-password"
						id="password"
						bind:value={formData.password}
						on:keydown={() => (errorStatus.password.status = false)}
						required
					/>{/if}

				<button class="absolute right-2 top-2" on:click={() => (showPassword = !showPassword)}>
					{#if showPassword}
						<iconify-icon icon="bi:eye-fill" color="base" width="24" />
					{:else}
						<iconify-icon icon="bi:eye-slash-fill" class="text-surface-500" width="24" />
					{/if}
				</button>

				{#if errorStatus.password.status}
					<div class="absolute left-0 top-11 text-xs text-error-500">
						{errorStatus.password.msg}
					</div>
				{/if}
			</div>

			<!-- Password Confirm -->
			<div class="group relative z-0 mb-6 w-full">
				<iconify-icon icon="mdi:password" width="18" class="absolute left-0 top-3.5 text-gray-400" />

				{#if showPassword}
					<FloatingInput
						type="text"
						name="confirm_password"
						id="confirm_password"
						label={m.modaleditform_confirmpassword()}
						bind:value={formData.confirmPassword}
						on:keydown={() => (errorStatus.confirm.status = false)}
						required
					/>
				{:else}
					<FloatingInput
						type="password"
						name="confirm_password"
						id="confirm_password"
						label={m.modaleditform_confirmpassword()}
						bind:value={formData.confirmPassword}
						on:keydown={() => (errorStatus.confirm.status = false)}
						required
					/>
				{/if}

				<button class="absolute right-2 top-2" on:click={() => (showPassword = !showPassword)}>
					{#if showPassword}
						<iconify-icon icon="bi:eye-fill" color="base" width="24" />
					{:else}
						<iconify-icon icon="bi:eye-slash-fill" class="text-surface-500" width="24" />
					{/if}
				</button>

				{#if errorStatus.confirm.status}
					<div class="absolute left-0 top-11 text-xs text-error-500">
						{errorStatus.confirm.msg}
					</div>
				{/if}
			</div>
		{/if}

		<!-- admin area -->
		<!-- TODO:  Self or last first user cannot change role -->
		{#if user?.role == roles.admin}
			<div class="flex flex-col gap-2 sm:flex-row">
				<div class="border-b text-center sm:w-1/4 sm:border-0 sm:text-left">{m.modaleditform_userrole()}</div>
				<div class="flex-auto">
					<div class="flex flex-wrap justify-center gap-2 space-x-2 sm:justify-start">
						{#each Object.values(roles) as r}
							<span
								class="chip {formData.role === r ? 'variant-filled-tertiary' : 'variant-ghost-secondary'}"
								on:click={() => {
									// filterRole(r);
									formData.role = r;
								}}
								on:keypress
								role="button"
								tabindex="0"
							>
								{#if formData.role === r}<span><iconify-icon icon="fa:check" /></span>{/if}
								<span class="capitalize">{r}</span>
							</span>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	</form>
	<!-- prettier-ignore -->
	<footer class="modal-footer {parent.regionFooter} justify-between">
		
		{#if !isFirstUser}
		<button type="button" on:click={deleteUser} class="variant-filled-error btn" disabled={isFirstUser && (!isGivenData || user?.userId == userId)}>
			<iconify-icon icon="icomoon-free:bin" width="24" /><span class="hidden sm:block">{m.modaleditform_delete()}</span>
		</button>
		{:else}
			<div></div>
			<!-- Empty div when using the default avatar -->
		{/if}

		<div class="flex justify-between gap-2">
        <button class="btn variant-outline-secondary" on:click={() => parent.onClose()}>{m.modaleditform_cancel()}</button>
        <button class="btn {parent.buttonPositive}" on:click={onFormSubmit}>{m.modaleditform_save()}</button>
	</div>
    </footer>
</div>
