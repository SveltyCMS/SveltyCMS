<script lang="ts">
	import { PUBLIC_SITENAME } from '$env/static/public';
	import { dev } from '$app/environment';

	import { page } from '$app/stores';
	import type { User } from '@src/collections/Auth';

	const username: User = $page.data.user.username;

	import { HOST_DEV, HOST_PROD } from '$env/static/private';
	export let hostLink = dev ? HOST_DEV : HOST_PROD;

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

<Html lang="en">
	<Head>
		<title>Welcome to {PUBLIC_SITENAME}</title>
		<meta name="description" content="Welcome to {PUBLIC_SITENAME}" />
	</Head>
	<Preview preview="Welcome to {PUBLIC_SITENAME}" />
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
			<Text>Dear {username},</Text>
			<Text>Welcome to {PUBLIC_SITENAME} - a Sveltekit powered flexible Headless CMS.</Text>
			<Text
				>SimpleCMS is a fast and flexible headless CMS that allows you to easily manage your
				content. With Sveltekit powering our platform, you can expect a seamless and efficient
				experience.</Text
			>
			<Text
				>If you have any questions or need help getting started, please visit our Q&A on Github <Link
					href="https://github.com/Rar9/SimpleCMS/discussions">SimpleCMS Discussion</Link
				>.</Text
			>
			<Text>Thank you for choosing SimpleCMS. We're excited to have you on board!</Text>
			<Section style={btnContainer}>
				<Button pX={12} pY={12} style={button} href={hostLink}>Go to {PUBLIC_SITENAME}</Button>
			</Section>
			<Hr style={hr} />
			<Text style={footer}>Your {PUBLIC_SITENAME} Team</Text>
		</Container>
	</Section>
</Html>
