<script lang="ts">
	import { Button, Hr, Html, Text } from 'svelte-email';

	interface EmailProps {
		name?: string;
		sitename?: string;
	}

	export let name: EmailProps['name'];
	export let sitename: EmailProps['sitename'];
</script>

<Html lang="en">
	<Text>
		Hello, {name}!
	</Text>
	<Hr />
	<Text>
		Your sitename: {sitename}!
	</Text>
	<Button href="https://svelte.dev">Visit {sitename}</Button>
</Html>
