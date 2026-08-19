<!--
@file src/components/emails/order-received.svelte
@component Customer order confirmation (better-svelte-email).
-->
<script lang="ts">
	import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@better-svelte-email/components';

	interface Props {
		orderNumber?: string;
		total?: string;
		items?: string;
		hostLink?: string;
	}

	const { orderNumber = '', total = '', items = '', hostLink = '' }: Props = $props();
</script>

<Html lang="en">
	<Head>
		<title>Order {orderNumber} received</title>
	</Head>
	<Preview preview="We received your order {orderNumber}" />
	<Body>
		<Container>
			<Section>
				<Heading>Order received</Heading>
				<Text>Thank you. We received order <strong>{orderNumber}</strong>.</Text>
				<Text>{items}</Text>
				<Text>Total: {total}</Text>
				{#if hostLink}
					<Text>View your order: {hostLink}</Text>
				{/if}
			</Section>
		</Container>
	</Body>
</Html>
