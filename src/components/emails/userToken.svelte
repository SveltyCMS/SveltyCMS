<!-- 
@file src/components/emails/userToken.svelte
@component
**userToken Email component to send user token invite to email**
-->

<script lang="ts">
	import { dev } from '$app/environment';
	import { publicEnv } from '@root/config/public';

	// Components
	import SiteName from '@components/SiteName.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { systemLanguage } from '@stores/store.svelte';

	// svelte-email-tailwind
	import { Html, Head, Preview, Body, Container, Section, Text, Link, Img, Button, Hr } from 'svelte-email-tailwind';

	interface Props {
		username?: string;
		email?: string;
		role?: string;
		token?: string;
		tokenLink?: string;
		languageTag?: string;
	}

	let { username = '', email = '', role = '', token = '', tokenLink, languageTag = systemLanguage.value }: Props = $props();

	// Generate tokenLink if not provided
	const finalTokenLink = tokenLink || `${dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}/login?regToken=${token}`;
</script>

<Html lang={languageTag}>
	<Head>
		<title>User Registration token for {publicEnv.SITE_NAME}</title>
	</Head>

	<Preview preview="User Registration token for {publicEnv.SITE_NAME}" />

	<Body>
		<Container>
			<!-- Header Section -->
			<Section>
				<Link href={dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}>
					<Img
						src="https://github.com/SveltyCMS/SveltyCMS/raw/main/static/SveltyCMS.png"
						alt={`${publicEnv.SITE_NAME} logo`}
						width="150"
						height="auto"
						style={{ marginLeft: 'auto', marginRight: 'auto', display: 'block' }}
					/>
				</Link>
			</Section>

			<!-- Main Content -->
			<Section>
				<Text>
					Hello {username}
				</Text>

				<Text>
					You have been invited to join <strong>{publicEnv.SITE_NAME}</strong>.
				</Text>

				<!-- User Information Box -->
				<Section>
					<Text>
						<strong>{m.usertoken_email()}</strong>
						{email}<br />
						<strong>{m.usertoken_role()}</strong>
						{role}<br />
						<strong>{m.usertoken_token()}</strong>
						{token}<br />
						<strong>{m.usertoken_valid()}</strong>
						{token}
					</Text>
				</Section>

				<Text>
					<strong><center>{m.usertoken_button()}</center></strong>
				</Text>

				<!-- CTA Button -->
				<Section>
					<Button href={finalTokenLink} pX={24} pY={12} style={{ backgroundColor: '#22c55e', color: '#fff', borderRadius: '8px' }}>
						{m.usertoken_createuser()}
					</Button>
				</Section>

				<Hr></Hr>

				<!-- Footer -->
				<Section>
					<Text style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '16px' }}>
						<Link href="https://SveltyCMS.com">
							Your <SiteName /> team
						</Link>
					</Text>
				</Section>
			</Section>
		</Container>
	</Body>
</Html>
