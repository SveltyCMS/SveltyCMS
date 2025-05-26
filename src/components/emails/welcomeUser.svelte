<!-- 
@file src/components/emails/welcomeUser.svelte
@component
**welcomeUser Email component to send welcome email to new user signup**
-->

<script lang="ts">
	import { dev } from '$app/environment';
	import { publicEnv } from '@root/config/public';

	// Components
	import SiteName from '@components/SiteName.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { systemLanguage } from '@stores/store.svelte';

	// svelte-email-tailwind components
	import { Html, Head, Preview, Body, Container, Section, Heading, Text, Link, Img, Button, Hr } from 'svelte-email-tailwind';

	interface Props {
		username?: string;
		hostLink?: string;
		languageTag?: string;
	}

	let { username = '', hostLink = dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD, languageTag = systemLanguage.value }: Props = $props();
</script>

<Html lang={languageTag}>
	<Head>
		<title>Welcome to <SiteName /></title>
	</Head>

	<Preview preview="Welcome to <SiteName /> - Your journey begins here!" />

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
				<Heading><center>Welcome to <strong><SiteName /></strong></center></Heading>
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
					{m.welcomeuser_thanks()}
				</Text>

				<!-- CTA Button -->
				<Section>
					<Button href={hostLink} pX={24} pY={12} style={{ backgroundColor: '#22c55e', color: '#fff', borderRadius: '8px' }}>
						Go to <SiteName />
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
