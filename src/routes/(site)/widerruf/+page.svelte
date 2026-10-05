<!--
@file src/routes/(site)/widerruf/+page.svelte
@component Withdrawal form. The footer button opens this page; submit confirms it.
-->
<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import CommerceLegalBar from '@components/site/commerce-legal-bar.svelte';
	import { clientJsonHeaders } from '@utils/security/client-csrf';

	let { data } = $props();
	let name = $state('');
	let email = $state('');
	let orderNumber = $state('');
	let message = $state('');
	let error = $state('');
	let done = $state(false);

	async function confirmWithdrawal(event: Event) {
		event.preventDefault();
		error = '';
		const res = await fetch('/api/commerce/withdraw', {
			method: 'POST',
			headers: clientJsonHeaders(),
			body: JSON.stringify({ name, email, orderNumber, confirm: true })
		});
		const body = await res.json().catch(() => ({}));
		if (!res.ok) {
			error = body.message || 'Withdrawal failed';
			return;
		}
		done = true;
		message = String(body.data?.withdrawalAt || body.withdrawalAt || '');
	}
</script>

<section class="mx-auto max-w-xl px-4 py-10 sm:px-6">
	<h1 class="text-2xl font-bold">{data.labels?.withdraw || 'Vertrag widerrufen'}</h1>
	<p class="mt-2 text-sm text-surface-500">
		{data.legalName
			? `${data.legalName} confirms the withdrawal by email with the time it was received.`
			: 'The trader confirms the withdrawal by email with the time it was received.'}
	</p>
	{#if error}<p class="mt-3 text-sm text-error-500" role="alert">{error}</p>{/if}
	{#if done}
		<p class="mt-6 text-sm" role="status">Withdrawal received{message ? ` at ${message}` : ''}.</p>
	{:else}
		<form class="mt-6 space-y-4" onsubmit={confirmWithdrawal}>
			<Input bind:value={name} required aria-label="Name" placeholder="Name" />
			<Input type="email" bind:value={email} required aria-label="Email" placeholder="Email" />
			<Input
				bind:value={orderNumber}
				required
				aria-label="Order number"
				placeholder="Order number"
			/>
			<Button type="submit" variant="primary"
				>{data.labels?.confirm || 'Widerruf bestätigen'}</Button
			>
		</form>
	{/if}
	{#if data.labels}
		<CommerceLegalBar labels={data.labels} />
	{/if}
</section>
