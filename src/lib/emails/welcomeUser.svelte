<script lang="ts">
	import { PUBLIC_SITENAME } from '$env/static/public';
	import { dev } from '$app/environment';
	import { HOST_DEV, HOST_PROD } from '$env/static/private';

	export let hostLink = dev ? HOST_DEV : HOST_PROD;

	// svelte-email
	import { Button, Container, Head, Hr, Html, Img, Preview, Section, Text } from 'svelte-email';

	interface EmailProps {
		username?: string;
	}
	export let username: EmailProps['username'];

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

	const paragraphbold = {
		fontFamily,
		fontSize: '16px',
		lineHeight: '26px',
		fontWeight: '600'
	};

	const review = {
		padding: '18px',
		backgroundColor: '#f2f3f3',
		borderRadius: '6px'
	};

	const btnContainer = {
		textAlign: 'center'
	};

	const button = {
		fontFamily,
		backgroundColor: '#8ddd15',
		borderRadius: '3px',
		color: '#000000',
		fontSize: '16px',
		textDecoration: 'none',
		textAlign: 'center',
		display: 'block'
	};

	const hr = {
		borderColor: '#cccccc',
		margin: '15px 0'
	};

	const footer = {
		fontFamily,
		color: '#8898aa',
		fontSize: '12px',
		textAlign: 'center'
	};

	const styleToString = (style: Record<string, string | number | null>) => {
		return Object.keys(style).reduce(
			(acc, key) =>
				acc +
				key
					.split(/(?=[A-Z])/)
					.join('-')
					.toLowerCase() +
				':' +
				style[key] +
				';',
			''
		);
	};
</script>

<Html lang="en">
	<Head>
		<title>Welcome to {PUBLIC_SITENAME}</title>
		<meta name="description" content="Welcome to {PUBLIC_SITENAME}" />
	</Head>
	<Preview preview="Welcome to {PUBLIC_SITENAME}" />
	<Section>
		<Container>
			<Section style={btnContainer}>
				<Img
					src="https://github.com/Rar9/SimpleCMS/raw/main/static/SimpleCMS_Logo_Round.png"
					alt="{PUBLIC_SITENAME} logo"
					width="150"
					height="auto"
				/>
			</Section>
			<Text>Dear {username}, welcome to {PUBLIC_SITENAME}</Text>
			<Text>A Sveltekit powered flexible Headless CMS</Text>
			<Text>We're excited to have you on board!</Text>
			<Section style={btnContainer}>
				<Button pX={12} pY={12} style={button} href={hostLink}>Go to</Button>
			</Section>
			<Hr style={hr} />
			<Text style={footer}>Your {PUBLIC_SITENAME} Team</Text>
		</Container>
	</Section>
</Html>
