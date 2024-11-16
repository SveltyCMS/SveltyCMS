<!-- 
@files src/components/emails/welcomeUser.svelte
@component
**welcomeUser Email component to send welcome email to new user signup**
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
	import { Button, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from 'svelty-email';
	interface Props {
		username?: string;
		hostLink?: any;
	}

	let { username = '', hostLink = dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD }: Props = $props();

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

<Html lang={systemLanguage.value}>
	<Head>
		<title>Welcome to <SiteName /></title>
		<meta name="description" content="Welcome to <SiteName />" />
	</Head>

	<Preview preview="Welcome to <SiteName />" />
	<Section>
		<Container>
			<Section style={btnContainer}>
				<Link href={hostLink}>
					<Img src="https://github.com/SveltyCMS/SveltyCMS/raw/main/static/SveltyCMS.png" alt={publicEnv.SITE_NAME} width="150" height="auto" />
				</Link>
			</Section>
			<Text>{m.welcomeuser_username({ username })}</Text>
			<Text>Welcome to <SiteName /> - a SvelteKit-powered flexible Headless CMS</Text>
			<Text>{m.welcomeuser_headless()}</Text>
			<Text>
				{m.welcomeuser_discussion1()}
				<Link href="https://github.com/SveltyCMS/SveltyCMS/discussions">{m.welcomeuser_discussion2()}</Link>
			</Text>
			<Text>{m.welcomeuser_thanks()}</Text>

			<Section style={btnContainer}>
				<Button pX={12} pY={12} style={button} href={hostLink}>Go   to <SiteName /></Button>
			</Section>
			<Hr style={hr} />
			<Link style={footer} href="https://www.sveltycms.com">Your <SiteName /> team</Link>
		</Container>
	</Section>
</Html>
