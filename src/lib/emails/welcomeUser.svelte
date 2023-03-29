<script lang="ts">
	import { PUBLIC_SITENAME } from '$env/static/public';
	import SimpleCmsLogo from '$src/components/icons/SimpleCMS_Logo.svelte';
	import { dev } from '$app/environment';
	import { HOST_DEV, HOST_PROD } from '$env/static/private';

	interface EmailProps {
		username?: string;
	}
	export let username: EmailProps['username'];

	// if (dev) {
	//     export let tokenLink = { HOST_DEV };
	// else
	// 	export let tokenLink = { HOST_PROD };
	// }

	// svelte-email
	import { Button, Container, Head, Hr, Html, Img, Preview, Section, Text } from 'svelte-email';
</script>

<Html lang="en">
	<Head>
		<title>Welcome to {PUBLIC_SITENAME}</title>
		<meta name="description" content="Welcome to {PUBLIC_SITENAME}" />
	</Head>
	<Preview preview="Welcome to {PUBLIC_SITENAME}" />
	<Section>
		<Container>
			<SimpleCmsLogo fill="red" className="h-8" />
			<Text>Dear ${username}, welcome to {PUBLIC_SITENAME}</Text>
			<Text>A Sveltekit powered flexible Headless CMS</Text>
			<Section>
				<Button pX={12} pY={12} href={HOST_DEV}>
					Go to {PUBLIC_SITENAME}
				</Button>
			</Section>
			<Text>We're excited to have you on board!</Text>
			<Hr />
			<Text>Your {PUBLIC_SITENAME} Team</Text>
		</Container>
	</Section>
</Html>
