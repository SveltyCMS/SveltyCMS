<!-- 
@files src/components/emails/userToken.svelte
@component
**userToken Email component to send user token invite to email**
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
	import { Button, Container, Column, Head, Hr, Html, Img, Link, Preview, Section, Text } from 'svelty-email';

	interface Props {
		username?: string;
		email?: string;
		// sitename?: string;
		role?: string;
		token?: string;
		tokenLink?: string;
	}

	let props: Props;

	const fontFamily = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif';

	const main = {
		backgroundColor: '#ffffff' as const
	};

	const container = {
		margin: '0 auto' as const,
		padding: '16px 0 48px' as const,
		width: '480px' as const
	};

	const label = {
		display: 'inline-block' as const,
		verticalAlign: 'top' as const,
		width: '25%' as const
	};

	const variable = {
		display: 'inline-block' as const,
		verticalAlign: 'top' as const,
		width: '75%' as const
	};

	const paragraph = {
		fontFamily,
		fontSize: '16px' as const,
		lineHeight: '26px' as const
	};

	const paragraphbold = {
		fontFamily,
		fontSize: '16px' as const,
		lineHeight: '26px' as const,
		fontWeight: '600' as const
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
		<title>User Registration token for {publicEnv.SITE_NAME}</title>
		<meta name="description" content="User Registration token for {publicEnv.SITE_NAME}" />
	</Head>
	<Preview preview="User Registration token for {publicEnv.SITE_NAME}" />
	<Section style={main}>
		<Container style={container}>
			<Section style={btnContainer}>
				<Link href={props.tokenLink || `${dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}/login?regToken=${props.token}`}>
					<Img
						src="https://github.com/SveltyCMS/SveltyCMS/raw/main/static/SveltyCMS.png"
						alt="{publicEnv.SITE_NAME} logo"
						width="150"
						height="auto"
					/>
				</Link>
			</Section>

			<Text style={paragraph}>Hello {props.username}</Text>
			<Text style={paragraph}>You have been invited to join {publicEnv.SITE_NAME} as {props.role}</Text>
			<Section style={review}>
				<Column style={label}>
					<Text style={paragraph}>{m.usertoken_email()}</Text>
					<Text style={paragraph}>{m.usertoken_token()}</Text>
					<Text style={paragraph}>{m.usertoken_role()}</Text>
					<Text style={paragraph}>{m.usertoken_valid()}</Text>
				</Column>
				<Column style={variable}>
					<Text style={paragraph}><span style={styleToString(paragraphbold)}>{props.email}</span></Text>
					<Text style={paragraph}>Your invitation token is:</Text>
					<Text style={paragraphbold}>{props.token}</Text>
					<Text style={paragraph}><span style={styleToString(paragraphbold)}>{props.role}</span></Text>
					<Text style={paragraph}>{m.usertoken_valid()}</Text>
				</Column>
			</Section>

			<Text style={paragraph}>{m.usertoken_button()}</Text>
			<Section style={btnContainer}>
				<Button
					pX={12}
					pY={12}
					style={button}
					href={props.tokenLink || `${dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}/login?regToken=${props.token}`}
				>
					{m.usertoken_createuser()}
				</Button>
			</Section>
			<Hr style={hr} />
			<Link style={footer} href="https://www.sveltycms.com">Your <SiteName /> team</Link>
		</Container>
	</Section>
</Html>
