<script lang="ts">
	import { dev } from '$app/environment';
	import { publicEnv } from '@root/config/public';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { languageTag } from '@src/paraglide/runtime';

	export let username: string = '';

	//console.log('systemLanguage: ', systemLanguage);

	export let hostLink = dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD;

	// svelty-email
	import { Button, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from 'svelty-email';

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

<Html lang={languageTag()}>
	<Head>
		<title>Welcome to {publicEnv.SITE_NAME} </title>
		<meta name="description" content="Welcome to {publicEnv.SITE_NAME}" />
	</Head>

	<Preview preview="Welcome to {publicEnv.SITE_NAME}" />
	<Section>
		<Container>
			<Section style={btnContainer}>
				<Link href={hostLink}>
					<Img src="https://github.com/Rar9/SveltyCMS/raw/main/static/SveltyCMS.png" alt={publicEnv.SITE_NAME} width="150" height="auto" />
				</Link>
			</Section>
			<Text>{m.welcomeuser_username({ username })}</Text>
			<Text>"Welcome to {publicEnv.SITE_NAME} - a Sveltekit powered flexible Headless CMS"</Text>
			<Text>{m.welcomeuser_headless()}</Text>
			<Text>
				{m.welcomeuser_discussion1()}

				<Link href="https://github.com/Rar9/SveltyCMS/discussions">{m.welcomeuser_discussion2()}</Link>
			</Text>
			<Text>{m.welcomeuser_thanks()}</Text>

			<Section style={btnContainer}>
				<Button pX={12} pY={12} style={button} href={hostLink}>"Go to {publicEnv.SITE_NAME}"</Button>
			</Section>
			<Hr style={hr} />
			<Text style={footer}>"Your {publicEnv.SITE_NAME} team"</Text>
		</Container>
	</Section>
</Html>
