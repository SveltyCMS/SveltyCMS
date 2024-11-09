<!-- 
@files src/components/emails/userToken.svelte
@description userToken Email component
-->

<script lang="ts">
	import { dev } from '$app/environment';
	import { publicEnv } from '@root/config/public';

	// Components
	import SiteName from '@components/SiteName.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { systemLanguage } from '@stores/store';

	// Svelty-email
	import { Button, Container, Column, Head, Hr, Html, Img, Link, Preview, Section, Text } from 'svelty-email';

	interface EmailProps {
		username?: string;
		email?: string;
		// sitename?: string;
		role?: string;
		token?: string;
		expiresIn?: string;
		expiresInLabel?: string;
	}
	
	interface Props {
		email: EmailProps['email'];
		// export let sitename: EmailProps['sitename'];
		role: EmailProps['role'];
		token: EmailProps['token'];
		expiresInLabel: EmailProps['expiresInLabel'];
		tokenLink?: any;
	}

	let {
		email,
		role,
		token,
		expiresInLabel,
		tokenLink = `${dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}/login?regToken=${token}`
	}: Props = $props();

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
		<title>User Registration token for {publicEnv.SITE_NAME}</title>
		<meta name="description" content="User Registration token for {publicEnv.SITE_NAME}" />
	</Head>
	<Preview preview="User Registration token for {publicEnv.SITE_NAME}" />
	<Section style={main}>
		<Container style={container}>
			<Section style={btnContainer}>
				<Link href={tokenLink}>
					<Img
						src="https://github.com/SveltyCMS/SveltyCMS/raw/main/static/SveltyCMS.png"
						alt="{publicEnv.SITE_NAME} logo"
						width="150"
						height="auto"
					/>
				</Link>
			</Section>

			<Text style={paragraph}>You have received an Access Token to create a new user for {publicEnv.SITE_NAME}</Text>
			<Section style={review}>
				<Column style={label}>
					<Text style={paragraph}>{m.usertoken_email()}</Text>
					<Text style={paragraph}>{m.usertoken_token()}</Text>
					<Text style={paragraph}>{m.usertoken_role()}</Text>
					<Text style={paragraph}>{m.usertoken_valid()}</Text>
				</Column>
				<Column style={variable}>
					<Text style={paragraph}><span style={styleToString(paragraphbold)}>{email}</span></Text>
					<Text style={paragraph}><span style={styleToString(paragraphbold)}>{token}</span></Text>
					<Text style={paragraph}><span style={styleToString(paragraphbold)}>{role}</span></Text>
					<Text style={paragraph}><span style={styleToString(paragraphbold)}>{expiresInLabel}</span></Text>
				</Column>
			</Section>

			<Text style={paragraph}>{m.usertoken_button()}</Text>
			<Section style={btnContainer}>
				<Button pX={12} pY={12} style={button} href={tokenLink}>{m.usertoken_createuser()}</Button>
			</Section>
			<Hr style={hr} />
			<Link style={footer} href="https://www.sveltycms.com">Your <SiteName /> team</Link>
		</Container>
	</Section>
</Html>
