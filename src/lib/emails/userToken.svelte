<script>
	import { PUBLIC_SITENAME } from '$env/static/public';
	import SimpleCmsLogo from '$src/components/icons/SimpleCMS_Logo.svelte';

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
		<title>User Registration token to access {PUBLIC_SITENAME}</title>
		<meta name="description" content="User Registration token to access {PUBLIC_SITENAME}" />
	</Head>
	<Preview preview="User Registration token to access {PUBLIC_SITENAME}" />
	<Section style={main}>
		<Container style={container}>
			<SimpleCmsLogo fill="red" className="h-8" />
			<Text style={paragraph}
				>You have recieved an access Token valid for XX to create a new user for {PUBLIC_SITENAME}</Text
			>
			<Text style={paragraph}>Please press the button to setup your user</Text>
			<Section style={btnContainer}>
				<Button pX={12} pY={12} style={button} href={tokenLink}>Create User</Button>
			</Section>
			<Hr style={hr} />
			<Text style={footer}>Your {PUBLIC_SITENAME} Team</Text>
		</Container>
	</Section>
</Html>
