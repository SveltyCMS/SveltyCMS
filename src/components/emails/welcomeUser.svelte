<!--
@file src/components/emails/welcomeUser.svelte
@component
**welcomeUser Email component to send welcome email to new user signup**
-->

<script lang="ts">
	import { dev } from '$app/environment';
	import { publicEnv } from '@src/stores/globalSettings.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { app } from '@stores/store.svelte';
	// better-svelte-email components
	import { Body, Button, Container, Head, Heading, Hr, Html, Img, Link, Preview, Section, Text } from 'better-svelte-email';

	interface Props {
		username?: string;
		hostLink?: string;
		languageTag?: string;
	}

	const { username = '', hostLink = dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD, languageTag = app.systemLanguage }: Props = $props();

	// Use production host logo if available, otherwise fall back to GitHub
	const logoSrc = publicEnv?.HOST_PROD
		? `${publicEnv.HOST_PROD}/SveltyCMS.png`
		: 'https://github.com/SveltyCMS/SveltyCMS/raw/main/static/SveltyCMS.png';
</script>

<Html lang={languageTag}>
	<Head>
		<title>Welcome to SveltyCMS</title>
	</Head>

	<Preview preview="Welcome to SveltyCMS - Your journey begins here!" />

	<Body>
		<Container>
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
				<Heading><center>Welcome to <strong>Svelty<span style="color:#22c55e;font-weight:bold;">CMS</span></strong></center></Heading>
				<Text>
					<strong><center>A SvelteKit-powered flexible Headless CMS</center></strong>
				</Text>

				<Text>
					{m.welcomeuser_username({ username: username || 'Anonymous' })}
				</Text>

				<Text>
					{m.welcomeuser_headless()}
				</Text>

				<Text>
					{m.welcomeuser_discussion1()}
				</Text>
				<Link href="https://github.com/SveltyCMS/SveltyCMS/discussions">
					<center>{m.welcomeuser_discussion2()}</center>
				</Link>

				<Text>
					Thank you for choosing <strong>Svelty<span style="color:#22c55e;font-weight:bold;">CMS</span></strong>!
				</Text>

				<!-- CTA Button -->
				<Section>
					<center>
						<Button
							href={hostLink}
							pX={24}
							pY={12}
							style="background-color: #22c55e; color: #fff; border-radius: 8px; min-width: 200px; font-weight: bold; font-size: 18px; display: inline-block;"
						>
							Go to SveltyCMS
						</Button>
					</center>
				</Section>

				<Hr></Hr>

				<!-- Footer -->
				<Section>
					<Text style="text-align: center; font-weight: bold; font-size: 16px;">
						<Link href="https://SveltyCMS.com">
							Your <span style="color:#111;">Svelty</span><span style="color:#22c55e;font-weight:bold;">CMS</span> team
						</Link>
					</Text>
				</Section>
			</Section>
		</Container>
	</Body>
</Html>
