<!--
@file src/routes/(site)/account/addresses/+page.svelte
@component Customer address book.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import { clientJsonHeaders } from '@utils/security/client-csrf';

	let addresses = $state<Array<Record<string, string>>>([]);
	let line1 = $state('');
	let city = $state('');
	let postal = $state('');
	let country = $state('');
	let error = $state('');

	async function load() {
		const res = await fetch('/api/commerce/addresses');
		const body = await res.json().catch(() => ({}));
		if (!res.ok) {
			error = body.message || 'Could not load addresses';
			return;
		}
		addresses = body.data || [];
	}

	async function save(event: Event) {
		event.preventDefault();
		const res = await fetch('/api/commerce/addresses', {
			method: 'POST',
			headers: clientJsonHeaders(),
			body: JSON.stringify({ line1, city, postal, country, isDefaultShipping: true })
		});
		const body = await res.json().catch(() => ({}));
		if (!res.ok) {
			error = body.message || 'Could not save';
			return;
		}
		line1 = city = postal = country = '';
		await load();
	}

	onMount(load);
</script>

<h1 class="text-2xl font-bold">Addresses</h1>
{#if error}
	<p class="mt-2 text-sm text-error-500" role="alert">{error}</p>
{/if}
<ul class="mt-4 space-y-2 text-sm">
	{#each addresses as addr (addr._id)}
		<li class="rounded border border-surface-200 p-3 dark:border-surface-700">
			{addr.line1}, {addr.city} {addr.postal}, {addr.country}
		</li>
	{/each}
</ul>
<form class="mt-6 space-y-3" onsubmit={save}>
	<Input bind:value={line1} required aria-label="Street" placeholder="Street" />
	<Input bind:value={city} required aria-label="City" placeholder="City" />
	<Input bind:value={postal} required aria-label="Postal code" placeholder="Postal" />
	<Input bind:value={country} required aria-label="Country" placeholder="DE" />
	<Button type="submit" variant="primary">Save address</Button>
</form>
