<script lang="ts">
	import { dev } from '$app/environment';
	import { publicEnv } from '@root/config/public';

	export let tokenLink = dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD;

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { systemLanguage } from '@src/stores/store';

	// Svelty-email
	import { Button, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from 'svelty-email';

	interface EmailProps {
		email?: string;
		resetLink: string;
		token: string;
		expiresIn: string;
	}
	export let email: EmailProps['email'];

	//TODO: send rest to domain? Token and delete used token
	export let token: EmailProps['token'];
	export let resetLink: EmailProps['resetLink'];
	export let expiresIn: EmailProps['expiresIn'];

	// Readable ExpireIn time sec to year
	import { ReadableExpireIn } from '@utils/utils';

	const fontFamily = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif';

	const main = {
		backgroundColor: '#ffffff'
	};

	const container = {
		margin: '0 auto',
		padding: '16px 0 48px',
		width: '480px'
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

<Html lang={$systemLanguage}>
	<Head>
		<title>Reset your password for {publicEnv.SITE_NAME}</title>
		<meta name="description" content="Reset your password for {publicEnv.SITE_NAME}" />
	</Head>
	<Preview preview="Reset your password for {publicEnv.SITE_NAME}" />
	<Section style={main}>
		<Container style={container}>
			<Section style={btnContainer}>
				<Link href={tokenLink}>
					<Img
						src="https://github.com/SveltyCMS/SveltyCMS/raw/main/static/SveltyCMS.png"
						alt="{publicEnv.SITE_NAME} logo"
						width="150"
						height="auto"
						style={{ display: 'block', margin: '0 auto' }}
					/>
				</Link>
			</Section>
			<Text style={paragraph}>Hello {email}</Text>
			<Text style={paragraph}>You have requested to reset your Password to get access to {publicEnv.SITE_NAME}</Text>
			<Section style={review}>
				<Text style={paragraph_center}>{m.forgottenpassword_token()}</Text>
				<Text style={paragraph_center}><span style={styleToString(paragraphbold)}>{token}</span></Text>
				<br />
				<Text style={paragraph_center}>{m.forgottenpassword_valid()}</Text>
				<Text style={paragraph_center}><span style={styleToString(paragraphbold)}>{ReadableExpireIn(expiresIn)}</span></Text>
			</Section>

			<Text style={paragraph_center}>{m.forgottenpassword_ignore()}</Text>
			<Text style={paragraph_center}>{m.forgottenpassword_button()}</Text>

			<Section style={btnContainer}>
				<Button pX={12} pY={12} style={button} href={resetLink}>{m.forgottenpassword_resetbutton()}</Button>
			</Section>
			<Hr style={hr} />
			<Text style={footer}>Your {publicEnv.SITE_NAME} Team</Text>
		</Container>
	</Section>
</Html>
