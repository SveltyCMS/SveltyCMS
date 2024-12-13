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

	export let username: string | undefined;
	export let hostLink: string = dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD;

	const fontFamily = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif';

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
			<Text>{m.welcomeuser_username({ username: username || '' })}</Text>
			<Text>Welcome to <SiteName /> - a SvelteKit-powered flexible Headless CMS</Text>
			<Text>{m.welcomeuser_headless()}</Text>
			<Text>
				{m.welcomeuser_discussion1()}
				<Link href="https://github.com/SveltyCMS/SveltyCMS/discussions">{m.welcomeuser_discussion2()}</Link>
			</Text>
			<Text>{m.welcomeuser_thanks()}</Text>

			<Section style={btnContainer}>
				<Button pX={12} pY={12} style={button} href={hostLink}>Go to <SiteName /></Button>
			</Section>
			<Hr style={hr} />
			<Link style={footer} href="https://www.sveltycms.com">Your <SiteName /> team</Link>
		</Container>
	</Section>
</Html>
