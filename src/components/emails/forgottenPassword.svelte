<script lang="ts">
	import { PUBLIC_SITENAME } from '$env/static/public';
	import { dev } from '$app/environment';
	import { HOST_DEV, HOST_PROD } from '$env/static/private';
	import { contentLanguage } from '@src/stores/store';

	export let tokenLink = dev ? HOST_DEV : HOST_PROD;
	console.log('tokenLink', tokenLink);

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';

	// svelte-email
	import { Button, Container, Column, Head, Hr, Html, Img, Link, Preview, Section, Text } from 'svelte-email';

	interface EmailProps {
		email?: string;
		resetLink: string;
		token: string;
		expires_in: string;
		expires_at: string;
	}
	export let email: EmailProps['email'];

	//TODO: send rest to domain?Token
	export let resetLink: EmailProps['resetLink'];
	export let token: EmailProps['token'];
	export let expires_at: EmailProps['token'];
	export let expires_in: EmailProps['token'];

	console.log('EmailProps Token: ', token);
	console.log('resetLink', resetLink);

	//TODO: Get token expire time
	let currentTime = new Date();
	let expirationTime = expires_at ? new Date(expires_at) : new Date();
	let timeDiff = expirationTime.getTime() - currentTime.getTime();
	let hoursDiff = Math.floor(timeDiff / (1000 * 60 * 60));
	let readable_expires_at = `${hoursDiff} hours`;

	console.log('expires_at', expires_at);
	console.log('expires_in', expires_in);
	console.log('readable_expires_at', readable_expires_at);

	const fontFamily = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif';

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

	const paragraph_center = {
		fontFamily,
		fontSize: '16px',
		lineHeight: '26px',
		textAlign: 'center'
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

<Html lang="%lang%">
	<Head>
		<title>{$LL.EMAIL_Forgotten_Title({ PUBLIC_SITENAME })}</title>
		<meta name="description" content={$LL.EMAIL_Forgotten_Meta({ PUBLIC_SITENAME })} />
	</Head>
	<Preview preview={$LL.EMAIL_Forgotten_Preview({ PUBLIC_SITENAME })} />
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
			<Text style={paragraph}>{$LL.EMAIL_Forgotten_Hello({ email })}</Text>
			<Text style={paragraph}>{$LL.EMAIL_Forgotten_Request({ PUBLIC_SITENAME })}</Text>
			<Section style={review}>
				<Text style={paragraph_center}>{$LL.EMAIL_Forgotten_Token()}</Text>
				<Text style={paragraph_center}><span style={styleToString(paragraphbold)}>{token}</span></Text>
				<br />
				<Text style={paragraph_center}>{$LL.EMAIL_Forgotten_Valid()}</Text>
				<Text style={paragraph_center}><span style={styleToString(paragraphbold)}>{readable_expires_at}</span></Text>
			</Section>

			<Text style={paragraph_center}>{$LL.EMAIL_Forgotten_Ignore()}</Text>
			<Text style={paragraph_center}>{$LL.EMAIL_Forgotten_Press()}</Text>

			<Section style={btnContainer}>
				<Button pX={12} pY={12} style={button} href={resetLink}>{$LL.EMAIL_Forgotten_Button()}</Button>
			</Section>
			<Hr style={hr} />
			<Text style={footer}>{$LL.EMAIL_Forgotten_Team({ PUBLIC_SITENAME })}</Text>
		</Container>
	</Section>
</Html>
