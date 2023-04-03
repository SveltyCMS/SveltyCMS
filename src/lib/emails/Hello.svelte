<script lang="ts">
	import { Button, Hr, Html, Text } from 'svelte-email';
	import SimpleCmsLogo from '$src/components/icons/SimpleCMS_Logo.svelte';
	import { Img } from 'svelte-email';

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
	<SimpleCmsLogo fill="red" className="h-8" />
	<Img
		src="https://svelte.dev/svelte-logo-horizontal.png"
		alt="Svelte logo"
		width="200"
		height="50"
	/>
	<Hr />
	<Text>
		Your sitename: {sitename}!
	</Text>
	<Button href="https://svelte.dev">Visit {sitename}</Button>
</Html>
