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

	<Body class="bg-gray-50 font-sans">
		<Container class="mx-auto max-w-2xl bg-white">
			<!-- Header Section -->
			<Section class="py-8 text-center">
				<Link href={hostLink} class="inline-block">
					<Img
						src="https://github.com/SveltyCMS/SveltyCMS/raw/main/static/SveltyCMS.png"
						alt={publicEnv.SITE_NAME}
						class="mx-auto"
						width="150"
						height="auto"
					/>
				</Link>
			</Section>

			<!-- Main Content -->
			<Section class="px-8 pb-8">
				<Heading class="mb-6 text-2xl font-bold text-gray-800">
					{m.welcomeuser_username({ username: username || 'there' })}
				</Heading>

				<Text class="mb-4 text-base leading-6 text-gray-700">
					Welcome to <SiteName /> - a SvelteKit-powered flexible Headless CMS
				</Text>

				<Text class="mb-4 text-base leading-6 text-gray-700">
					{m.welcomeuser_headless()}
				</Text>

				<Text class="mb-6 text-base leading-6 text-gray-700">
					{m.welcomeuser_discussion1()}
					<Link href="https://github.com/SveltyCMS/SveltyCMS/discussions" class="text-green-600 underline hover:text-green-700">
						{m.welcomeuser_discussion2()}
					</Link>
				</Text>

				<Text class="mb-8 text-base leading-6 text-gray-700">
					{m.welcomeuser_thanks()}
				</Text>

				<!-- CTA Button -->
				<Section class="mb-8 text-center">
					<Button
						href={hostLink}
						class="text-decoration-none inline-block rounded-lg bg-green-500 px-6 py-3 font-semibold text-white transition-colors duration-200 hover:bg-green-600"
					>
						Go to <SiteName />
					</Button>
				</Section>

				<Hr class="my-8 border-gray-200" />

				<!-- Footer -->
				<Section class="text-center">
					<Link href="https://www.sveltycms.com" class="text-sm text-gray-500 hover:text-gray-700">
						Your <SiteName /> team
					</Link>
				</Section>
			</Section>
		</Container>
	</Body>
</Html>
