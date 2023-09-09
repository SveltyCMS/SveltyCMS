<script lang="ts">
	import { PUBLIC_SITENAME } from '$env/static/public';
	import { dev } from '$app/environment';

	import { page } from '$app/stores';
	import type { User } from '@src/collections/Auth';

	const username: User = $page.data.user.username;

	import { HOST_DEV, HOST_PROD } from '$env/static/private';
	export let tokenLink = dev ? HOST_DEV : HOST_PROD;

	// svelte-email
	import {
		Button,
		Container,
		Head,
		Hr,
		Html,
		Img,
		Link,
		Preview,
		Section,
		Text
	} from 'svelte-email';

	const fontFamily =
		'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif';

	const main = {
		backgroundColor: '#ffffff'
	};

	const container = {
		margin: '0 auto',
		padding: '20px 0 48px'
	};

	const logo = {
		margin: '0 auto'
	};

	const paragraph = {
		fontFamily,
		fontSize: '16px',
		lineHeight: '26px'
	};

	const btnContainer = {
		textAlign: 'center'
	};

	const button = {
		fontFamily,
		backgroundColor: '#5F51E8',
		borderRadius: '3px',
		color: '#fff',
		fontSize: '16px',
		textDecoration: 'none',
		textAlign: 'center',
		display: 'block'
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

<Html lang="en">
	<Head>
		<title>Your password for {PUBLIC_SITENAME} was changed</title>
		<meta name="description" content="Your password for {PUBLIC_SITENAME} was changed" />
	</Head>
	<Preview preview="Your password for {PUBLIC_SITENAME} was changed" />
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
			<Text style={paragraph}>Hello {username},</Text>
			<Text style={paragraph}
				>You have successfully changed your Password for {PUBLIC_SITENAME}</Text
			>
			<Text style={paragraph}>If you did not request this change, please contact us.</Text>
			<Hr style={hr} />
			<Text style={footer}>Your {PUBLIC_SITENAME} Team</Text>
		</Container>
	</Section>
</Html>
