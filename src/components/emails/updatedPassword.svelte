<!-- 
@file src/components/emails/updatedPassword.svelte
@component
**updatedPassword Email component to confirm password change**
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
	import { Html, Head, Preview, Body, Container, Section, Text, Link, Img, Hr, Custom, Heading } from 'svelte-email-tailwind';

	interface Props {
		username?: string;
		tokenLink?: string;
		languageTag?: string;
	}

	let { username = '', tokenLink = dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD, languageTag = systemLanguage.value }: Props = $props();
</script>

<Html lang={languageTag}>
	<Head>
		<title>Your password for {publicEnv.SITE_NAME} was changed</title>
	</Head>

	<Preview preview="Your password for {publicEnv.SITE_NAME} was changed" />

	<Body>
		<Container style={{ fontSize: '16px' }}>
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
				<!-- Success Message -->
				<Section>
					<Heading><center>Password Successfully Changed</center></Heading>
					<Text><center>Your account security has been updated.</center></Text>
				</Section>

				<Text style={{ fontSize: '16px' }}>
					{m.updatedpassword_hello({ username })}
				</Text>

				<Text style={{ fontSize: '16px' }}>
					You have successfully changed your password for <strong>{publicEnv.SITE_NAME}</strong>.
				</Text>

				<!-- Security Notice -->
				<Section>
					<Text style={{ fontSize: '16px' }}>
						<strong>Security Notice:</strong><br />If you did not make this change, please contact our support team immediately and secure your
						account.
					</Text>
				</Section>

				<Text style={{ fontSize: '16px' }}>
					{m.updatedpassword_contact()}
				</Text>

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
