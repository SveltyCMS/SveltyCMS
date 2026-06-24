<!--
@file src/components/emails/magic-link.svelte
@component
**magicLink Email component to sign in without password**
-->

<script lang="ts">
	// @ts-nocheck

	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { app } from '@src/stores/store.svelte';
	import { Body, Button, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from '@better-svelte-email/components';
	import { dev } from '$app/environment';

	interface Props {
		email?: string;
		expiresInMinutes?: number;
		languageTag?: string;
		magicLink: string;
	}

	const { email = '', magicLink, expiresInMinutes = 15, languageTag = app.systemLanguage }: Props = $props();

	// Use production host logo if available, otherwise fall back to GitHub
	const logoSrc = publicEnv?.HOST_PROD
		? `${publicEnv.HOST_PROD}/SveltyCMS.png`
		: 'https://github.com/SveltyCMS/SveltyCMS/raw/main/static/SveltyCMS.png';
</script>

<Html lang={languageTag}>
	<Head>
		<title>Sign in to {publicEnv?.SITE_NAME ?? 'SveltyCMS'}</title>
	</Head>

	<Preview preview="Click the link to sign in to {publicEnv?.SITE_NAME ?? 'SveltyCMS'}" />

	<Body>
		<Container style="font-size: 16px;">
			<!-- Header Section -->
			<Section>
				<Link href={dev ? (publicEnv?.HOST_DEV ?? 'http://localhost:5173') : (publicEnv?.HOST_PROD ?? '')}>
					<Img
						src={logoSrc}
						alt={`${publicEnv?.SITE_NAME ?? 'SveltyCMS'} logo`}
						width="150"
						height="auto"
						style="margin-left: auto; margin-right: auto; display: block;"
					/>
				</Link>
			</Section>

			<!-- Main Content -->
			<Section>
				<Text style="font-size: 16px;">Hello <strong>{email}</strong>,</Text>

				<Text style="font-size: 16px;">
					Click the button below to sign in passwordless to your <strong>Svelty<span style="color:#22c55e;font-weight:bold;">CMS</span></strong> account.
				</Text>

				<!-- CTA Button -->
				<Section style="margin: 24px 0; text-align: center;">
					<center>
						<Button
							href={magicLink}
							pX={24}
							pY={12}
							style="background-color: #22c55e; color: #fff; border-radius: 8px; min-width: 200px; font-weight: bold; font-size: 18px; display: inline-block;">
							Sign In to SveltyCMS
						</Button>
					</center>
				</Section>

				<Text style="font-size: 14px; color: #666; text-align: center;">
					This link is valid for {expiresInMinutes} minutes and can only be used once.
				</Text>

				<Text style="font-size: 14px; color: #666; text-align: center;">
					If you did not request this sign-in link, you can safely ignore this email.
				</Text>

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
