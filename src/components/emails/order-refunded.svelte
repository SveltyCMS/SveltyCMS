<!--
@file src/components/emails/order-refunded.svelte
@component Refund notification email.
-->
<script lang="ts">
	import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@better-svelte-email/components';

	interface Props {
		orderNumber?: string;
		total?: string;
	}

	const { orderNumber = '', total = '' }: Props = $props();
</script>

<Html lang="en">
	<Head>
		<title>Refund for {orderNumber}</title>
	</Head>
	<Preview preview="Refund processed for order {orderNumber}" />
	<Body>
		<Container>
			<Section>
				<Heading>Refund processed</Heading>
				<Text>A refund for order <strong>{orderNumber}</strong> ({total}) has been recorded.</Text>
			</Section>
		</Container>
	</Body>
</Html>
