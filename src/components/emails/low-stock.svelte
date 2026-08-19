<!--
@file src/components/emails/low-stock.svelte
@component Merchant low-stock alert.
-->
<script lang="ts">
	import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@better-svelte-email/components';

	interface Props {
		sku?: string;
		title?: string;
		qty?: number;
		threshold?: number;
	}

	const { sku = '', title = '', qty = 0, threshold = 0 }: Props = $props();
</script>

<Html lang="en">
	<Head>
		<title>Low stock {sku}</title>
	</Head>
	<Preview preview="Low stock for {sku}" />
	<Body>
		<Container>
			<Section>
				<Heading>Low stock</Heading>
				<Text>{title} ({sku}) is at {qty} (threshold {threshold}).</Text>
			</Section>
		</Container>
	</Body>
</Html>
