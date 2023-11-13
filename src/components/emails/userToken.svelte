<script lang="ts">
	import { PUBLIC_SITENAME } from '$env/static/public';
	import { dev } from '$app/environment';
	import { HOST_DEV, HOST_PROD } from '$env/static/private';

	// typesafe-i18n
	import { systemLanguage } from '@src/stores/store';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// svelte-email
	import { Button, Container, Column, Head, Hr, Html, Img, Link, Preview, Section, Text } from 'svelte-email';

	interface EmailProps {
		username?: string;
		email?: string;
		// sitename?: string;
		role?: string;
		token?: string;
		expiresIn?: string;
		expiresInLabel?: string;
	}
	export let email: EmailProps['email'];
	// export let sitename: EmailProps['sitename'];
	export let role: EmailProps['role'];
	export let token: EmailProps['token'];
	export let expiresInLabel: EmailProps['expiresInLabel'];
	export let tokenLink = `${dev ? HOST_DEV : HOST_PROD}/login?regToken=${token}`;

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
		<title>{m.usertokentitle({ PUBLIC_SITENAME })}</title>
		<meta name="description" content={m.usertokenmeta({ PUBLIC_SITENAME })} />
	</Head>
	<Preview preview={m.usertokenpreview({ PUBLIC_SITENAME })} />
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

			<Text style={paragraph}>{m.usertokenaccesstoken({ PUBLIC_SITENAME })}</Text>
			<Section style={review}>
				<Column style={label}>
					<Text style={paragraph}>{m.usertokenemail()}</Text>
					<Text style={paragraph}>{m.usertokentoken()}</Text>
					<Text style={paragraph}>{m.usertokenrole()}</Text>
					<Text style={paragraph}>{m.usertokenvalid()}</Text>
				</Column>
				<Column style={variable}>
					<Text style={paragraph}><span style={styleToString(paragraphbold)}>{email}</span></Text>
					<Text style={paragraph}><span style={styleToString(paragraphbold)}>{token}</span></Text>
					<Text style={paragraph}><span style={styleToString(paragraphbold)}>{role}</span></Text>
					<Text style={paragraph}><span style={styleToString(paragraphbold)}>{expiresInLabel}</span></Text>
				</Column>
			</Section>

			<Text style={paragraph}>{m.usertokenbutton()}</Text>
			<Section style={btnContainer}>
				<Button pX={12} pY={12} style={button} href={tokenLink}>{m.usertokencreateuser()}</Button>
			</Section>
			<Hr style={hr} />
			<Text style={footer}>{m.usertokenteam({ PUBLIC_SITENAME })}</Text>
		</Container>
	</Section>
</Html>
