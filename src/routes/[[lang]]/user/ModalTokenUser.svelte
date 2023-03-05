<script lang="ts">
	// Props
	/** Exposes parent props to this component. */
	export let parent: any;

	// Skelton & Stores
	import { modalStore } from '@skeletonlabs/skeleton';

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';
	import { enhance } from '$app/forms';
	import Error from '$src/routes/+error.svelte';
	import { error, fail } from '@sveltejs/kit';

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';

	let email = '';

	// TODO: Get allowed user Roles from .app.d.ts
	let roles: Record<string, boolean> = {
		Admin: false,
		Editor: true,
		User: false,
		Guest: false
	};

	let roleSelected = 'Editor';
	let errorStatus = {
		email: { status: false, msg: '' },
		valid: { status: false, msg: '' }
	};

	function filterRole(role: string): void {
		for (const r in roles) {
			if (r !== role) {
				roles[r] = false;
			}
		}
		roles[role] = !roles[role];
	}

	// Token Valid Duration
	let validSelected = '12 hrs';
	let valids: Record<string, boolean> = {
		'2 hrs': false,
		'12 hrs': true,
		'48 hrs': false
	};

	function filterValid(valid: string): void {
		for (const v in valids) {
			if (v !== valid) {
				valids[v] = false;
			}
		}
		valids[valid] = !valids[valid];
	}
</script>

<!-- @component This example creates a simple form modal. -->

<div class="modal-example-form {cBase}">
	<header class={cHeader}>{$modalStore[0]?.title ?? '(title missing)'}</header>
	<article>{$modalStore[0]?.body ?? '(body missing)'}</article>
	<!-- Enable for debugging: -->
	<!-- <pre>{JSON.stringify(formData, null, 2)}</pre> -->
	<form
		class="modal-form {cForm}"
		method="post"
		action="?/generateToken"
		use:enhance={({ data, cancel }) => {
			data.append('role', roleSelected);
			let expires_in = 120;
			// converting it in milliseconds
			switch (validSelected) {
				case '2 hrs':
					expires_in = 2 * 60 * 60 * 1000;
					break;
				case '12 hrs':
					expires_in = 12 * 60 * 60 * 1000;
					break;
				case '48 hrs':
					expires_in = 48 * 60 * 60 * 1000;
					break;
				default:
					errorStatus['valid'].status = true;
					errorStatus['valid'].msg = 'Invalid value for token validity';
					cancel();
			}
			data.append('expires_in', expires_in.toString());
			return async ({ result }) => {
				if (result.type === 'success') {
					modalStore.close();
				}
				if (result.type === 'failure') {
					result?.data?.errors &&
						// @ts-ignore
						result?.data?.errors.forEach((error) => {
							errorStatus[error.field].status = true;
							errorStatus[error.field].msg = error.message;
						});
				}
			};
		}}
	>
		<!-- Email field -->
		<div class="group relative z-0 mb-6 w-full">
			<Icon icon="mdi:email" width="18" class="absolute top-3.5 left-0 text-gray-400" />
			<input
				bind:value={email}
				on:keydown={() => (errorStatus.email.status = false)}
				color={errorStatus.email.status ? 'red' : 'base'}
				name="newUserEmail"
				class="peer block w-full appearance-none !rounded-none !border-0 !border-b-2 !border-surface-300 !bg-transparent py-2.5 px-6 text-sm text-surface-900 focus:border-tertiary-600 focus:outline-none focus:ring-0 dark:border-surface-600 dark:text-white dark:focus:border-tertiary-500"
				placeholder=" "
				required
			/>
			<label
				for="email"
				class="absolute top-3 left-5 -z-10 origin-[0] -translate-y-6 scale-75 transform text-sm duration-300 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:left-0 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-tertiary-600 dark:text-surface-400 peer-focus:dark:text-tertiary-500"
			>
				{$LL.LOGIN_EmailAddress()}<span class="ml-2 text-error-500">*</span>
			</label>
			{#if errorStatus.email.status}
				<div class="absolute top-11 left-0 text-xs text-error-500">
					{errorStatus.email.msg}
				</div>
			{/if}
		</div>

		<div class="flex flex-col sm:flex-row gap-2">
			<div class="sm:w-1/4">User Role:</div>
			<div class="flex-auto">
				<div class="flex flex-wrap gap-2 space-x-2">
					{#each Object.keys(roles) as r}
						<span
							class="chip {roles[r] ? 'variant-filled-tertiary' : 'variant-ghost-secondary'}"
							on:click={() => {
								filterRole(r);
								roleSelected = r;
							}}
							on:keypress
						>
							{#if roles[r]}<span><Icon icon="fa:check" /></span>{/if}
							<span class="capitalize">{r}</span>
						</span>
					{/each}
				</div>
			</div>
		</div>

		<div class="flex flex-col sm:flex-row gap-2">
			<div class="sm:w-1/4">Token validity:</div>
			<div class="flex-auto">
				<div class="flex flex-wrap gap-2 space-x-2">
					{#each Object.keys(valids) as v}
						<span
							class="chip {valids[v] ? 'variant-filled-tertiary' : 'variant-ghost-secondary'}"
							on:click={() => {
								filterValid(v);
								validSelected = v;
							}}
							on:keypress
						>
							{#if valids[v]}<span><Icon icon="fa:check" /></span>{/if}
							<span class="capitalize">{v}</span>
						</span>
					{/each}
				</div>
				{#if errorStatus.valid.status}
					<div class="text-xs mt-1 text-error-500">
						{errorStatus.valid.msg}
					</div>
				{/if}
			</div>
		</div>

		<footer class="modal-footer {parent.regionFooter}">
			<button class="btn {parent.buttonNeutral}" on:click={parent.onClose}
				>{parent.buttonTextCancel}</button
			>
			<button type="submit" class="btn !bg-primary-500 {parent.buttonPositive}">Send</button>
		</footer>
	</form>
</div>
