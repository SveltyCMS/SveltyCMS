<script lang="ts">
	import { PUBLIC_SITENAME } from '$env/static/public';
	import { dev } from '$app/environment';
	import { contentLanguage } from '@src/stores/store';

	import { page } from '$app/stores';
	import type { User } from '@src/collections/Auth';
	// TODO: Not working
	const username: User = $page.data.user.username;

	import { HOST_DEV, HOST_PROD } from '$env/static/private';

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';

	export let hostLink = dev ? HOST_DEV : HOST_PROD;

	// svelte-email
	import { Button, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from 'svelte-email';

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

<Html lang="%lang%">
	<Head>
		<title>{$LL.EMAIL_Welcome_Title({ PUBLIC_SITENAME })}</title>
		<meta name="description" content={$LL.EMAIL_Welcome_Meta({ PUBLIC_SITENAME })} />
	</Head>

	<Preview preview={$LL.EMAIL_Welcome_Preview({ PUBLIC_SITENAME })} />
	<Section>
		<Container>
			<Section style={btnContainer}>
				<Link href={hostLink}>
					<Img
						src="https://github.com/Rar9/SimpleCMS/raw/main/static/SimpleCMS_Logo_Round.png"
						alt="{PUBLIC_SITENAME} logo"
						width="150"
						height="auto"
					/>
				</Link>
			</Section>
			<Text>{$LL.EMAIL_Welcome_Username({ username })}</Text>
			<Text>{$LL.EMAIL_Welcome_Sitename({ PUBLIC_SITENAME })}</Text>
			<Text>{$LL.EMAIL_Welcome_SimpleCMS()}</Text>
			<Text>
				{$LL.EMAIL_Welcome_Discussion1()}
				<Link href="https://github.com/Rar9/SimpleCMS/discussions">{$LL.EMAIL_Welcome_Discussion2()}</Link>
			</Text>
			<Text>{$LL.EMAIL_Welcome_Thanks()}</Text>

			<Section style={btnContainer}>
				<Button pX={12} pY={12} style={button} href={hostLink}>{$LL.EMAIL_Welcome_Button({ PUBLIC_SITENAME })}</Button>
			</Section>
			<Hr style={hr} />
			<Text style={footer}>{$LL.EMAIL_Welcome_Footer({ PUBLIC_SITENAME })}</Text>
		</Container>
	</Section>
</Html>
