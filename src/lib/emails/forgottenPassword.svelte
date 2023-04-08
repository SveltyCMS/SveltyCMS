<script lang="ts">
	import { PUBLIC_SITENAME } from '$env/static/public';
	import { dev } from '$app/environment';
	import { HOST_DEV, HOST_PROD } from '$env/static/private';

	export let tokenLink = dev ? HOST_DEV : HOST_PROD;

	// svelte-email
	import {
		Button,
		Container,
		Column,
		Head,
		Hr,
		Html,
		Img,
		Link,
		Preview,
		Section,
		Text
	} from 'svelte-email';

	interface EmailProps {
		email?: string;
		resetLink: string;
		token: string;
		expires_at: string;
	}
	export let email: EmailProps['email'];
	export let resetLink: EmailProps['resetLink'];
	export let token: EmailProps['token'];
	export let expires_at: EmailProps['token'];
	let currentTime = new Date();
	let expirationTime = expires_at ? new Date(expires_at) : new Date();
	let timeDiff = expirationTime.getTime() - currentTime.getTime();
	let hoursDiff = Math.floor(timeDiff / (1000 * 60 * 60));
	let readable_expires_at = `${hoursDiff} hours`;

	const fontFamily =
		'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif';

	const main = {
		backgroundColor: '#ffffff'
	};

	const container = {
		margin: '0 auto',
		padding: '16px 0 48px',
		width: '480px'
	};

	const label = {
		display: 'inline-block',
		verticalAlign: 'top',
		width: '25%' // Update width to 35%
	};

	const variable = {
		display: 'inline-block',
		verticalAlign: 'top',
		width: '75%' // Update width to 65%
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
		padding: '6px',
		backgroundColor: '#f2f3f3'
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
		<title>Reset your password for {PUBLIC_SITENAME}</title>
		<meta name="description" content="Reset your password for {PUBLIC_SITENAME}" />
	</Head>
	<Preview preview="Reset your password for {PUBLIC_SITENAME}" />
	<Section style={main}>
		<Container style={container}>
			<Section style={btnContainer}>
				<Link href={tokenLink}>
					<Img
						src="https://github.com/Rar9/SimpleCMS/raw/main/static/SimpleCMS_Logo_Round.png"
						alt="{PUBLIC_SITENAME} logo"
						width="150"
						height="auto"
						style={{ display: 'block', margin: '0 auto' }}
					/>
				</Link>
			</Section>

			<Text style={paragraph}>Hello {email},</Text>
			<Text style={paragraph}
				>You have requested to reset your Password to get access to {PUBLIC_SITENAME}</Text
			>
			<Section style={review}>
				<Column style={label}>
					<Text style={paragraph}>Your reset Token:</Text>
					<Text style={paragraph}>Is valid only for:</Text>
				</Column>
				<Column style={variable}>
					<Text style={paragraph}><span style={styleToString(paragraphbold)}>{token}</span></Text>
					<Text style={paragraph}
						><span style={styleToString(paragraphbold)}>{readable_expires_at}</span></Text
					>
				</Column>
			</Section>

			<Text style={paragraph}>If you did not request this reset, please ignore this email.</Text>
			<Text style={paragraph}>Please press the button to reset your password</Text>

			<Section style={btnContainer}>
				<Button pX={12} pY={12} style={button} href={resetLink}>Reset Password</Button>
			</Section>

			<Hr style={hr} />
			<Text style={footer}>Your {PUBLIC_SITENAME} Team</Text>
		</Container>
	</Section>
</Html>
