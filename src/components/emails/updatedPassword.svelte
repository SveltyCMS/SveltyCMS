<!-- 
@files src/components/emails/updatedPassword.svelte
@component
**updatedPassword Email component to reset existing password**
-->

<script lang="ts">
	import { dev } from '$app/environment';
	import { publicEnv } from '@root/config/public';

	// Components
	import SiteName from '@components/SiteName.svelte';

	// Stores
	import { page } from '$app/state';
	import { systemLanguage } from '@stores/store.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Auth
	import type { User } from '@src/auth/types';
	const username: User = page.data.user.username;

	// svelty-email
	import { Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from 'svelty-email';
	let { tokenLink = dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD } = $props();

	const fontFamily = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif';

	const main = {
		backgroundColor: '#ffffff'
	};

	const container = {
		margin: '0 auto',
		padding: '20px 0 48px'
	};

	const paragraph = {
		fontFamily,
		fontSize: '16px',
		lineHeight: '26px'
	};

	const hr = {
		borderColor: '#cccccc',
		margin: '20px 0'
	};

	const footer = {
		fontFamily,
		color: '#8898aa',
		fontSize: '12px'
	};
</script>

<Html lang={systemLanguage.value}>
	<Head>
		<title>Your password for {publicEnv.SITE_NAME} was changed</title>
		<meta name="description" content="Your password for {publicEnv.SITE_NAME} was changed" />
	</Head>
	<Preview preview="Your password for {publicEnv.SITE_NAME} was changed" />
	<Section style={main}>
		<Container style={container}>
			<Link href={tokenLink}>
				<Img src="https://github.com/SveltyCMS/SveltyCMS/raw/main/static/SveltyCMS.png" alt="{publicEnv.SITE_NAME} logo" width="150" height="auto" />
			</Link>
			<Text style={paragraph}>{m.updatedpassword_hello({ username })}</Text>
			<Text style={paragraph}>You have successfully changed your Password for {publicEnv.SITE_NAME}</Text>
			<Text style={paragraph}>{m.updatedpassword_contact()}</Text>
			<Hr style={hr} />
			<Link style={footer} href="https://www.sveltycms.com">Your <SiteName /> team</Link>
		</Container>
	</Section>
</Html>
