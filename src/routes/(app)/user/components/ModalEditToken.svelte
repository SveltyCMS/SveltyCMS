<script lang="ts">
	import { page } from '$app/stores';
	import { invalidateAll } from '$app/navigation';

	// Get data from page store
	const { roles, user } = $page.data;

	console.log('Roles:', roles); // Add this line to log roles

	// Props
	export let parent: any;
	let formElement: HTMLFormElement;

	// Skeleton & Stores
	import { getModalStore } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	export let token: string;
	export let email: string;
	export let role: string;
	export let user_id: string;

	// Form Data
	const formData = {
		user_id: user_id,
		email: email,
		token: token,
		role: role
	};

	const errorStatus = {
		user_id: { status: false, msg: '' },
		email: { status: false, msg: '' },
		token: { status: false, msg: '' }
	};

	// Custom submit function to pass the response and close the modal
	function onFormSubmit(): void {
		console.log('modal submitted.');
		if ($modalStore[0].response) $modalStore[0].response(formData);

		modalStore.close();
	}

	const deleteToken = async () => {
		const res = await fetch(`?/deleteToken`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify([
				{
					user_id: user_id,
					role: role
				}
			])
		});

		if (res.status === 200) {
			modalStore.close();
			await invalidateAll();
		}
	};

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4 bg-white';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';
</script>

<!-- @component This example creates a simple form modal. -->
{#if $modalStore[0]}
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
				<input
					bind:value={formData.user_id}
					on:keydown={() => (errorStatus.user_id.status = false)}
					color={errorStatus.user_id.status ? 'red' : 'base'}
					type="text"
					name="username"
					class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent px-6 py-2.5 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
					placeholder=" "
					required
					disabled
				/>
				<label
					for="username"
					class="absolute left-5 top-3 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
				>
					{m.modaledit_tokenusername()}<span class="ml-2 text-error-500">*</span>
				</label>

				{#if !errorStatus.user_id.status}
					<div class="absolute left-0 top-11 text-xs text-error-500">
						{errorStatus.user_id.msg}
					</div>
				{/if}
			</div>

			<!-- Email field -->
			<div class="group relative z-0 mb-6 w-full">
				<iconify-icon icon="mdi:email" width="18" class="absolute left-0 top-3.5 text-gray-400" />
				<input
					bind:value={formData.email}
					on:keydown={() => (errorStatus.email.status = false)}
					color={errorStatus.email.status ? 'red' : 'base'}
					type="email"
					name="email"
					class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent px-6 py-2.5 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
					placeholder=" "
					required
					disabled
				/>
				<label
					for="email"
					class="absolute left-5 top-3 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
				>
					{m.form_emailaddress()}<span class="ml-2 text-error-500">*</span>
				</label>
				{#if errorStatus.email.status}
					<div class="absolute left-0 top-11 text-xs text-error-500">
						{errorStatus.email.msg}
					</div>
				{/if}
			</div>
			<!-- Token field -->
			<div class="group relative z-0 mb-6 w-full">
				<iconify-icon icon="mdi:token" width="18" class="absolute left-0 top-3.5 text-gray-400" />
				<input
					bind:value={formData.token}
					on:keydown={() => (errorStatus.token.status = false)}
					color={errorStatus.token.status ? 'red' : 'base'}
					type="text"
					name="token"
					class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent px-6 py-2.5 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
					placeholder=" "
					required
					disabled
				/>
				<label
					for="token"
					class="absolute left-5 top-3 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
				>
					{m.modaledit_tokenregistrationtoken()}
					<span class="ml-2 text-error-500">*</span>
				</label>
				{#if errorStatus.token.status}
					<div class="absolute left-0 top-11 text-xs text-error-500">
						{errorStatus.token.msg}
					</div>
				{/if}
			</div>

			<!-- Admin area -->
			{#if user.role == 'admin'}
				<div class="flex flex-col gap-2 sm:flex-row">
					<div class="border-b text-center sm:w-1/4 sm:border-0 sm:text-left">{m.form_userrole()}:</div>
					<div class="flex-auto">
						<div class="flex flex-wrap justify-center gap-2 space-x-2 sm:justify-start">
							{#if roles && roles.length > 0}
								{#each roles as r}
									<button
										type="button"
										class="chip {formData.role === r._id ? 'variant-filled-tertiary' : 'variant-ghost-secondary'}"
										on:click={() => (formData.role = r._id)}
									>
										{#if formData.role === r._id}
											<span><iconify-icon icon="fa:check" /></span>
										{/if}
										<span class="capitalize">{r.name}</span>
									</button>
								{/each}
							{:else}
								<p class="text-tertiary-500 dark:text-primary-500">Loading roles...</p>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</form>

		<footer class="{parent.regionFooter} flex items-center justify-between">
			<button type="button" on:click={deleteToken} class="variant-filled-error btn">
				<iconify-icon icon="icomoon-free:bin" width="24" /><span class="hidden sm:block">{m.button_delete()}</span>
			</button>

			<div class="flex justify-between gap-2">
				<button class="variant-outline-secondary btn" on:click={parent.onClose}>{m.button_cancel()}</button>
				<button class="btn {parent.buttonPositive}" on:click={onFormSubmit}>{m.button_save()}</button>
			</div>
		</footer>
	</div>
{/if}
