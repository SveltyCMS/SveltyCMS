<script lang="ts">
	import { dev } from '$app/environment';
	import { publicEnv } from '@root/config/public';
	import { systemLanguage } from '@src/stores/store';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	export let username: string = '';

	export let hostLink = dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD;

	// Svelty-email
	import { Button, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from 'svelty-email';
	import SiteName from '@components/SiteName.svelte';

	const fontFamily = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif';

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
</script>

<Html lang={$systemLanguage}>
	<Head>
		<title>Welcome to <SiteName /></title>
		<meta name="description" content="Welcome to <SiteName />" />
	</Head>

	<Preview preview="Welcome to <SiteName />" />
	<Section>
		<Container>
			<Section style={btnContainer}>
				<Link href={hostLink}>
					<Img src="https://github.com/Rar9/SveltyCMS/raw/main/static/SveltyCMS.png" alt={publicEnv.SITE_NAME} width="150" height="auto" />
				</Link>
			</Section>
			<Text>{m.welcomeuser_username({ username })}</Text>
			<Text>Welcome to <SiteName /> - a SvelteKit-powered flexible Headless CMS</Text>
			<Text>{m.welcomeuser_headless()}</Text>
			<Text>
				{m.welcomeuser_discussion1()}
				<Link href="https://github.com/Rar9/SveltyCMS/discussions">{m.welcomeuser_discussion2()}</Link>
			</Text>
			<Text>{m.welcomeuser_thanks()}</Text>

			<Section style={btnContainer}>
				<Button pX={12} pY={12} style={button} href={hostLink}>Go to <SiteName /></Button>
			</Section>
			<Hr style={hr} />
			<Text style={footer}>Your <SiteName /> team</Text>
		</Container>
	</Section>
</Html>
