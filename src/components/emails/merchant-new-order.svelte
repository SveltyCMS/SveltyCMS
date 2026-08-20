<!--
@file src/components/emails/merchant-new-order.svelte
@component Merchant new-order alert.
-->
<script lang="ts">
	import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@better-svelte-email/components';

	interface Props {
		orderNumber?: string;
		email?: string;
		total?: string;
		items?: string;
	}

	const { orderNumber = '', email = '', total = '', items = '' }: Props = $props();
</script>

<Html lang="en">
	<Head>
		<title>New order {orderNumber}</title>
	</Head>
	<Preview preview="New order {orderNumber}" />
	<Body>
		<Container>
			<Section>
				<Heading>New order</Heading>
				<Text>{orderNumber} from {email}</Text>
				<Text>{items}</Text>
				<Text>Total: {total}</Text>
			</Section>
		</Container>
	</Body>
</Html>
