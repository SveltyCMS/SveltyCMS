<script>
	import { PUBLIC_SITENAME } from '$env/static/public';
	import SimpleCmsLogo from '$src/components/icons/SimpleCMS_Logo.svelte';

	// Lucia
	import { getUser } from '@lucia-auth/sveltekit/client';
	const user = getUser();

	// svelte-email
	import { Button, Container, Head, Hr, Html, Img, Preview, Section, Text } from 'svelte-email';

	const fontFamily =
		'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif';

	const main = {
		backgroundColor: '#ffffff'
	};

	const container = {
		margin: '0 auto',
		padding: '20px 0 48px'
	};

	const logo = {
		margin: '0 auto'
	};

	const paragraph = {
		fontFamily,
		fontSize: '16px',
		lineHeight: '26px'
	};

	const btnContainer = {
		textAlign: 'center' as const
	};

	const button = {
		fontFamily,
		backgroundColor: '#5F51E8',
		borderRadius: '3px',
		color: '#fff',
		fontSize: '16px',
		textDecoration: 'none',
		textAlign: 'center' as const,
		display: 'block'
	};

	const hr = {
		borderColor: '#cccccc',
		margin: '20px 0'
	};

	const footer = {
		fontFamily,
		color: '#8898aa',
		fontSize: '12px'
	};
</script>

<Html lang="en">
	<Head>
		<title>Welcome to {PUBLIC_SITENAME}</title>
		<meta name="description" content="Welcome to {PUBLIC_SITENAME}" />
	</Head>
	<Preview preview="Welcome to {PUBLIC_SITENAME}" />
	<Section style={main}>
		<Container style={container}>
			<SimpleCmsLogo fill="red" className="h-8" />
			<Text style={paragraph}>{$user?.username}, welcome to {PUBLIC_SITENAME}</Text>
			<Text style={paragraph}>A Sveltekit powered flexible Headless CMS</Text>
			<Section style={btnContainer}>
				<Button pX={12} pY={12} style={button} href="https://localhost:5173/SimpleCMS/">
					Go to {PUBLIC_SITENAME}
				</Button>
			</Section>
			<Text style={paragraph}>We're excited to have you on board!</Text>
			<Hr style={hr} />
			<Text style={footer}>Your {PUBLIC_SITENAME} Team</Text>
		</Container>
	</Section>
</Html>
