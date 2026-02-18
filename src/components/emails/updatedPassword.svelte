<!--
@file src/components/emails/updatedPassword.svelte
@component
**updatedPassword Email component to confirm password change**
-->

<script lang="ts">
	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import { app } from '@stores/store.svelte';
	// better-svelte-email
	import { Body, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text } from 'better-svelte-email';
	import { dev } from '$app/environment';

	interface Props {
		languageTag?: string;
		tokenLink?: string;
		username?: string;
	}

	const { username = '', languageTag = app.systemLanguage }: Props = $props();

	// Use production host logo if available, otherwise fall back to GitHub
	const logoSrc = publicEnv?.HOST_PROD
		? `${publicEnv.HOST_PROD}/SveltyCMS.png`
		: 'https://github.com/SveltyCMS/SveltyCMS/raw/main/static/SveltyCMS.png';
</script>

<Html lang={languageTag}>
	<Head>
		<title>Your password for {publicEnv.SITE_NAME} was changed</title>
	</Head>

	<Preview preview="Your password for {publicEnv.SITE_NAME} was changed" />

	<Body>
		<Container style="font-size: 16px;">
			<!-- Header Section -->
			<Section>
				<Link href={dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD}>
					<Img
						src={logoSrc}
						alt={`${publicEnv.SITE_NAME} logo`}
						width="150"
						height="auto"
						style="margin-left: auto; margin-right: auto; display: block;"
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

				<Text style="font-size: 16px;">{m.updatedpassword_hello({ username })}</Text>

				<Text style="font-size: 16px;">
					You have successfully changed your password for <strong>Svelty<span style="color:#22c55e;font-weight:bold;">CMS</span></strong>.
				</Text>

				<!-- Security Notice -->
				<Section>
					<Text style="font-size: 16px;">
						<strong>Security Notice:</strong><br>If you did not make this change, please contact our support team immediately and secure your account.
					</Text>
				</Section>

				<Text style="font-size: 16px;">{m.updatedpassword_contact()}</Text>

				<Hr></Hr>

				<!-- Footer -->
				<Section>
					<Text style="text-align: center; font-weight: bold; font-size: 16px;">
						<Link href="https://SveltyCMS.com">
							Your <span style="color:#111;">Svelty</span><span style="color:#22c55e;font-weight:bold;">CMS</span>
							team
						</Link>
					</Text>
				</Section>
			</Section>
		</Container>
	</Body>
</Html>
