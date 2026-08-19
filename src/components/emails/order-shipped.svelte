<!--
@file src/components/emails/order-shipped.svelte
@component Shipping confirmation email.
-->
<script lang="ts">
	import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@better-svelte-email/components';

	interface Props {
		orderNumber?: string;
		trackingUrl?: string;
		items?: string;
	}

	const { orderNumber = '', trackingUrl = '', items = '' }: Props = $props();
</script>

<Html lang="en">
	<Head>
		<title>Order {orderNumber} shipped</title>
	</Head>
	<Preview preview="Order {orderNumber} is on the way" />
	<Body>
		<Container>
			<Section>
				<Heading>Your order shipped</Heading>
				<Text>Order <strong>{orderNumber}</strong> is on the way.</Text>
				<Text>{items}</Text>
				{#if trackingUrl}
					<Text>Tracking: {trackingUrl}</Text>
				{/if}
			</Section>
		</Container>
	</Body>
</Html>
