<script>
	import { PUBLIC_SITENAME } from '$env/static/public';
	import { dev } from '$app/environment';
	import { HOST_DEV, HOST_PROD } from '$env/static/private';

	export let tokenLink = dev ? HOST_DEV : HOST_PROD;

	// svelte-email
	import { Button, Container, Head, Hr, Html, Img, Preview, Section, Text } from 'svelte-email';

	interface EmailProps {
		username?: string;
		email?: string;
		sitename?: string;
		role?: string;
		token?: string;
		expires_in?: string;
	}
	export let email: EmailProps['email'];
	export let sitename: EmailProps['sitename'];
	export let role: EmailProps['role'];
	export let token: EmailProps['token'];
	export let expires_in: EmailProps['token'];

	import { dev } from '$app/environment';
	import { HOST_DEV, HOST_PROD } from '$env/static/private';

	export let tokenLink = { HOST_DEV };

	// if (dev) {
	//     export let tokenLink = { HOST_DEV };
	// else
	// 	export let tokenLink = { HOST_PROD };
	// }

	const fontFamily =
		'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif';

	const main = {
		backgroundColor: '#ffffff'
	};

	const container = {
		margin: '0 auto',
		padding: '20px 0 48px'
	};

	const paragraph = {
		fontFamily,
		fontSize: '16px',
		lineHeight: '26px'
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
		<title>User Registration token for {PUBLIC_SITENAME}</title>
		<meta name="description" content="User Registration token for {PUBLIC_SITENAME}" />
	</Head>
	<Preview preview="User Registration token for {PUBLIC_SITENAME}" />
	<Section style={main}>
		<Container style={container}>
			<Img
				src="https://github.com/Rar9/SimpleCMS/blob/main/static/SimpleCMS_Logo_Round.png"
				alt="{PUBLIC_SITENAME} logo"
				width="200"
				height="50"
			/>
			<Text style={paragraph}
				>You have recieved an Access Token to create a new user for {PUBLIC_SITENAME}</Text
			>
			<Text style={paragraph}>Email: {email}</Text>
			<Text style={paragraph}>Access Token: {token}</Text>
			<Text style={paragraph}>Role: {role}</Text>
			<Text style={paragraph}>valid for: {expires_in}</Text>

			<Text style={paragraph}>Please press the button to setup your user with this email</Text>
			<Section>
				<Button pX={12} pY={12} style={button} href={tokenLink}>Create User</Button>
			</Section>
			<Hr style={hr} />
			<Text style={footer}>Your {PUBLIC_SITENAME} Team</Text>
		</Container>
	</Section>
</Html>
