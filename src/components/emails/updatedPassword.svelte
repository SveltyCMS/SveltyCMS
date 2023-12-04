<script lang="ts">
	import { PUBLIC_SITENAME } from '$env/static/public';
	import { dev } from '$app/environment';

	import { page } from '$app/stores';
	import type { User } from '@src/collections/Auth';

	const username: User = $page.data.user.username;

	import * as m from '@src/paraglide/messages';
	import { languageTag } from '@src/paraglide/runtime';

	import { HOST_DEV, HOST_PROD } from '$env/static/private';
	export let tokenLink = dev ? HOST_DEV : HOST_PROD;

	// svelte-email
	import { Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from 'svelte-email';

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

<Html lang={languageTag()}>
	<Head>
		<title>{m.updatedpassword_title({ PUBLIC_SITENAME })}</title>
		<meta name="description" content={m.updatedpassword_meta({ PUBLIC_SITENAME })} />
	</Head>
	<Preview preview={m.updatedpassword_preview({ PUBLIC_SITENAME })} />
	<Section style={main}>
		<Container style={container}>
			<Link href={tokenLink}>
				<Img
					src="https://github.com/Rar9/SimpleCMS/raw/main/static/SimpleCMS_Logo_Round.png"
					alt="{PUBLIC_SITENAME} logo"
					width="150"
					height="auto"
				/>
			</Link>
			<Text style={paragraph}>{m.updatedpassword_hello({ username })}</Text>
			<Text style={paragraph}>{m.updatedpassword_change({ PUBLIC_SITENAME })}</Text>
			<Text style={paragraph}>{m.updatedpassword_contact()}</Text>
			<Hr style={hr} />
			<Text style={footer}>{m.updatedpassword_team({ PUBLIC_SITENAME })}</Text>
		</Container>
	</Section>
</Html>
