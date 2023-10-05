<script lang="ts">
	import { PUBLIC_SITENAME } from '$env/static/public';
	import { dev } from '$app/environment';
	import { HOST_DEV, HOST_PROD } from '$env/static/private';

	// import { page } from '$app/stores';
	// import type { User } from '@src/collections/Auth';

	// const username: User = $page.data.user.username;

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';
	import { systemLanguage } from '@src/stores/store';

	// svelte-email
	import { Button, Container, Column, Head, Hr, Html, Img, Link, Preview, Section, Text } from 'svelte-email';

	interface EmailProps {
		username?: string;
		email?: string;
		// sitename?: string;
		role?: string;
		token?: string;
		expiresIn?: string;
	}
	export let email: EmailProps['email'];
	// export let sitename: EmailProps['sitename'];
	export let role: EmailProps['role'];
	export let token: EmailProps['token'];
	export let expiresIn: EmailProps['expiresIn'];
	export let tokenLink = `${dev ? HOST_DEV : HOST_PROD}/login?regToken=${token}`;
	console.log(email, role, token, expiresIn, tokenLink);

	let currentTime = new Date();
	let expirationTime = expiresIn ? new Date(expiresIn) : new Date();
	let timeDiff = currentTime.getTime() - expirationTime.getTime();
	let hoursDiff = Math.floor(timeDiff / (1000 * 60 * 60));
	let readable_expires_at = `${hoursDiff} hours`;

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
		<title>{$LL.EMAIL_UserToken_Title({ PUBLIC_SITENAME })}</title>
		<meta name="description" content={$LL.EMAIL_UserToken_Meta({ PUBLIC_SITENAME })} />
	</Head>
	<Preview preview={$LL.EMAIL_UserToken_Preview({ PUBLIC_SITENAME })} />
	<Section style={main}>
		<Container style={container}>
			<Section style={btnContainer}>
				<Link href={tokenLink}>
					<Img
						src="https://github.com/Rar9/SimpleCMS/raw/main/static/SimpleCMS_Logo_Round.png"
						alt="{PUBLIC_SITENAME} logo"
						width="150"
						height="auto"
					/>
				</Link>
			</Section>

			<Text style={paragraph}>{$LL.EMAIL_UserToken_Access({ PUBLIC_SITENAME })}</Text>
			<Section style={review}>
				<Column style={label}>
					<Text style={paragraph}>{$LL.EMAIL_UserToken_Email()}</Text>
					<Text style={paragraph}>{$LL.EMAIL_UserToken_Token()}</Text>
					<Text style={paragraph}>{$LL.EMAIL_UserToken_Role()}</Text>
					<Text style={paragraph}>{$LL.EMAIL_UserToken_Valid()}</Text>
				</Column>
				<Column style={variable}>
					<Text style={paragraph}><span style={styleToString(paragraphbold)}>{email}</span></Text>
					<Text style={paragraph}><span style={styleToString(paragraphbold)}>{token}</span></Text>
					<Text style={paragraph}><span style={styleToString(paragraphbold)}>{role}</span></Text>
					<Text style={paragraph}><span style={styleToString(paragraphbold)}>{readable_expires_at}</span></Text>
				</Column>
			</Section>

			<Text style={paragraph}>{$LL.EMAIL_UserToken_Press()}</Text>
			<Section style={btnContainer}>
				<Button pX={12} pY={12} style={button} href={tokenLink}>{$LL.EMAIL_UserToken_Button()}</Button>
			</Section>
			<Hr style={hr} />
			<Text style={footer}>{$LL.EMAIL_UserToken_Team({ PUBLIC_SITENAME })}</Text>
		</Container>
	</Section>
</Html>
