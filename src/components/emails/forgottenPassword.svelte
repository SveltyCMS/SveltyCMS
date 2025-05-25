<!-- 
@file src/components/emails/forgottenPassword.svelte
@component
**forgottenPassword Email component to reset password**
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

	// Readable ExpireIn time sec to year
	import { ReadableExpireIn } from '@utils/utils';

	interface Props {
		email?: string;
		token: string;
		resetLink: string;
		expiresIn: string;
		languageTag?: string;
	}

	let { email = '', token, resetLink, expiresIn, languageTag = systemLanguage.value }: Props = $props();
</script>

<Html lang={languageTag}>
	<Head>
		<title>Reset your password for {publicEnv.SITE_NAME}</title>
	</Head>

	<Preview preview="Reset your password for {publicEnv.SITE_NAME}" />

	<Body class="bg-gray-50 font-sans">
		<Container class="mx-auto max-w-2xl bg-white">
			<!-- Header Section -->
			<Section class="py-8 text-center">
				<Link href={dev ? publicEnv.HOST_DEV : publicEnv.HOST_PROD} class="inline-block">
					<Img
						src="https://github.com/SveltyCMS/SveltyCMS/raw/main/static/SveltyCMS.png"
						alt="{publicEnv.SITE_NAME} logo"
						class="mx-auto"
						width="150"
						height="auto"
					/>
				</Link>
			</Section>

			<!-- Main Content -->
			<Section class="px-8 pb-8">
				<Text class="mb-4 text-base leading-6 text-gray-700">
					Hello {email}
				</Text>

				<Text class="mb-6 text-base leading-6 text-gray-700">
					You have requested to reset your password to get access to {publicEnv.SITE_NAME}.
				</Text>

				<!-- Token Information Box -->
				<Section class="mb-6 rounded-lg bg-gray-100 p-6">
					<Text class="mb-2 text-center text-base text-gray-700">
						{m.forgottenpassword_token()}
					</Text>
					<Text class="mb-4 rounded border bg-white p-3 text-center font-mono text-xl font-bold text-gray-900">
						{token}
					</Text>

					<Text class="mb-2 text-center text-base text-gray-700">
						{m.forgottenpassword_valid()}
					</Text>
					<Text class="text-center text-lg font-semibold text-red-600">
						{ReadableExpireIn(expiresIn)}
					</Text>
				</Section>

				<Text class="mb-4 text-center text-sm text-gray-600">
					{m.forgottenpassword_ignore()}
				</Text>

				<Text class="mb-6 text-center text-base text-gray-700">
					{m.forgottenpassword_button()}
				</Text>

				<!-- CTA Button -->
				<Section class="mb-8 text-center">
					<Button
						href={resetLink}
						class="text-decoration-none inline-block rounded-lg bg-green-500 px-6 py-3 font-semibold text-white transition-colors duration-200 hover:bg-green-600"
					>
						{m.forgottenpassword_resetbutton()}
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
