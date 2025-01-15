<!-- 
@files src/components/emails/forgottenPassword.svelte
@component
**forgottenPassword Email component to reset password**
-->

<script lang="ts">
	import { dev } from '$app/environment';
	import { publicEnv } from '@root/config/public';

	// Components
	import SiteName from '@components/SiteName.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { systemLanguage } from '@stores/store.svelte';

	// Svelty-email
	import { Button, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from 'svelty-email';

	interface EmailProps {
		email?: string;
		resetLink: string;
		token: string;
		expiresIn: string;
	}

	// Readable ExpireIn time sec to year
	import { ReadableExpireIn } from '@utils/utils';
	interface Props {
		tokenLink?: string;
		email: EmailProps['email'];
		//TODO: send rest to domain? Token and delete used token
		token: EmailProps['token'];
		resetLink: EmailProps['resetLink'];
		expiresIn: EmailProps['expiresIn'];
	}

	let props: Props = $props();

	const fontFamily = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif';

	const main = {
		backgroundColor: '#ffffff' as const
	};

	const container = {
		margin: '0 auto' as const,
		padding: '16px 0 48px' as const,
		width: '480px' as const
	};

	const paragraph = {
		fontFamily,
		fontSize: '16px' as const,
		lineHeight: '26px' as const,
		textAlign: 'left' as const
	};

	const paragraph_center = {
		...paragraph,
		textAlign: 'center' as const
	};

	const paragraphbold = {
		...paragraph,
		fontWeight: 'bold' as const
	};

	const review = {
		padding: '6px' as const,
		backgroundColor: '#f2f3f3' as const
	};

	const btnContainer = {
		textAlign: 'center' as const
	};

	const button = {
		fontFamily,
		backgroundColor: '#8ddd15' as const,
		borderRadius: '3px' as const,
		color: '#000000' as const,
		fontSize: '16px' as const,
		textDecoration: 'none' as const,
		textAlign: 'center' as const,
		display: 'block' as const
	};

	const hr = {
		borderColor: '#cccccc' as const,
		margin: '15px 0' as const
	};

	const footer = {
		fontFamily,
		color: '#8898aa' as const,
		fontSize: '12px' as const,
		textAlign: 'center' as const
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

<Html lang={systemLanguage.value}>
	<Head>
		<title>Reset your password for {publicEnv.SITE_NAME}</title>
		<meta name="description" content="Reset your password for {publicEnv.SITE_NAME}" />
	</Head>
	<Preview preview="Reset your password for {publicEnv.SITE_NAME}" />
	<Section style={main}>
		<Container style={container}>
			<Section style={btnContainer}>
				<Link href={dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}>
					<Img
						src="https://github.com/SveltyCMS/SveltyCMS/raw/main/static/SveltyCMS.png"
						alt="{publicEnv.SITE_NAME} logo"
						width="150"
						height="auto"
						style={{ display: 'block', margin: '0 auto', textAlign: 'center' }}
					/>
				</Link>
			</Section>
			<Text style={paragraph}>Hello {props.email}</Text>
			<Text style={paragraph}>You have requested to reset your Password to get access to {publicEnv.SITE_NAME}</Text>
			<Section style={review}>
				<Text style={paragraph_center}>{m.forgottenpassword_token()}</Text>
				<Text style={paragraph_center}><span style={styleToString(paragraphbold)}>{props.token}</span></Text>
				<br />
				<Text style={paragraph_center}>{m.forgottenpassword_valid()}</Text>
				<Text style={paragraph_center}><span style={styleToString(paragraphbold)}>{ReadableExpireIn(props.expiresIn)}</span></Text>
			</Section>

			<Text style={paragraph_center}>{m.forgottenpassword_ignore()}</Text>
			<Text style={paragraph_center}>{m.forgottenpassword_button()}</Text>

			<Section style={btnContainer}>
				<Button pX={12} pY={12} style={button} href={props.resetLink}>{m.forgottenpassword_resetbutton()}</Button>
			</Section>
			<Hr style={hr} />
			<Link style={footer} href="https://www.sveltycms.com">Your <SiteName /> team</Link>
		</Container>
	</Section>
</Html>
