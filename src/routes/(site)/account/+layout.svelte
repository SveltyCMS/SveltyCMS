<!--
@file src/routes/(site)/account/+layout.svelte
@component Customer account chrome (orders + addresses).
-->
<script lang="ts">
	import Button from '@components/ui/button.svelte';
	let { children } = $props();
</script>

<div class="mx-auto max-w-4xl px-4 py-8 sm:px-6">
	<nav class="mb-6 flex gap-2" aria-label="Account">
		<Button variant="ghost" size="sm" href="/account/orders" data-preload="hover">Orders</Button>
		<Button variant="ghost" size="sm" href="/account/addresses" data-preload="hover">Addresses</Button>
	</nav>
	{@render children()}
</div>
