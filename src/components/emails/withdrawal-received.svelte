<!--
@file src/components/emails/withdrawal-received.svelte
@component Confirms that a consumer withdrawal was received, with a timestamp.
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
		withdrawalAt?: string;
		legalName?: string;
	}

	const { orderNumber = '', withdrawalAt = '', legalName = '' }: Props = $props();
</script>

<Html lang="en">
	<Head>
		<title>Withdrawal {orderNumber}</title>
	</Head>
	<Preview preview="Withdrawal received for {orderNumber}" />
	<Body>
		<Container>
			<Section>
				<Heading>Withdrawal received</Heading>
				<Text>
					We received your withdrawal for order <strong>{orderNumber}</strong> at {withdrawalAt}.
				</Text>
				{#if legalName}<Text>{legalName}</Text>{/if}
			</Section>
		</Container>
	</Body>
</Html>
