<script lang="ts">
	import { PUBLIC_SITENAME } from '$env/static/public';
	import SimpleCmsLogo from '$src/components/icons/SimpleCMS_Logo.svelte';

	// svelte-email
	import { Button, Container, Head, Hr, Html, Img, Preview, Section, Text } from 'svelte-email';

	interface EmailProps {
		username?: string;
		resetLink: string;
		token: string;
	}
	export let username: EmailProps['username'];
	export let resetLink: EmailProps['resetLink'];
	export let token: EmailProps['token'];
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
		textAlign: 'center'
	};

	const button = {
		fontFamily,
		backgroundColor: '#5F51E8',
		borderRadius: '3px',
		color: '#fff',
		fontSize: '16px',
		textDecoration: 'none',
		textAlign: 'center',
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
		<title>Reset your password for {PUBLIC_SITENAME}</title>
		<meta name="description" content="Reset your password for {PUBLIC_SITENAME}" />
	</Head>
	<Preview preview="Reset your password for {PUBLIC_SITENAME}" />
	<Section style={main}>
		<Container style={container}>
			<SimpleCmsLogo fill="red" className="h-8" />
			<Text style={paragraph}
				>You have requested to reset your Password to get access to {PUBLIC_SITENAME}</Text
			>
			<Text style={paragraph}>Please press the button to reset your password</Text>
			<Section style={btnContainer}>
				<Button pX={12} pY={12} style={button} href={resetLink}>Reset Password</Button>
			</Section>
			<Hr style={hr} />
			<Text style={footer}>Your {PUBLIC_SITENAME} Team</Text>
		</Container>
	</Section>
</Html>
