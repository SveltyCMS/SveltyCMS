<!--
@file src/components/emails/order-received.svelte
@component Customer order confirmation (better-svelte-email).
-->
<script lang="ts">
	import {
		Body,
		Container,
		Head,
		Heading,
		Html,
		Preview,
		Section,
		Text
	} from '@better-svelte-email/components';

	interface Props {
		orderNumber?: string;
		total?: string;
		net?: string;
		tax?: string;
		items?: string;
		hostLink?: string;
		legalName?: string;
		legalAddress?: string;
		vatId?: string;
		withdrawalUrl?: string;
	}

	const {
		orderNumber = '',
		total = '',
		net = '',
		tax = '',
		items = '',
		hostLink = '',
		legalName = '',
		legalAddress = '',
		vatId = '',
		withdrawalUrl = ''
	}: Props = $props();
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
				{#if net}<Text>Net: {net}</Text>{/if}
				{#if tax}<Text>VAT: {tax}</Text>{/if}
				<Text>Total (incl. VAT): {total}</Text>
				{#if legalName}
					<Text>{legalName}</Text>
					<Text>{legalAddress}</Text>
					{#if vatId}<Text>VAT ID: {vatId}</Text>{/if}
				{/if}
				{#if withdrawalUrl}
					<Text>Withdraw from this contract: {withdrawalUrl}</Text>
				{/if}
				{#if hostLink}
					<Text>View your order: {hostLink}</Text>
				{/if}
			</Section>
		</Container>
	</Body>
</Html>
