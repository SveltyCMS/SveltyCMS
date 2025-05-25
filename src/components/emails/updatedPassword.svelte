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
	import { Html, Head, Preview, Body, Container, Section, Text, Link, Img, Hr } from 'svelte-email-tailwind';

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

	<Body class="bg-gray-50 font-sans">
		<Container class="mx-auto max-w-2xl bg-white">
			<!-- Header Section -->
			<Section class="py-8 text-center">
				<Link href={tokenLink} class="inline-block">
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
				<!-- Success Message -->
				<Section class="mb-6 rounded-lg border border-green-200 bg-green-50 p-6">
					<div class="mb-4 flex items-center justify-center">
						<div class="flex h-12 w-12 items-center justify-center rounded-full bg-green-500">
							<svg class="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
							</svg>
						</div>
					</div>
					<Text class="mb-2 text-center text-lg font-semibold text-green-800">Password Successfully Changed</Text>
					<Text class="text-center text-base text-green-700">Your account security has been updated</Text>
				</Section>

				<Text class="mb-4 text-base leading-6 text-gray-700">
					{m.updatedpassword_hello({ username })}
				</Text>

				<Text class="mb-6 text-base leading-6 text-gray-700">
					You have successfully changed your password for {publicEnv.SITE_NAME}.
				</Text>

				<!-- Security Notice -->
				<Section class="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
					<Text class="text-sm leading-5 text-blue-800">
						<strong>Security Notice:</strong> If you did not make this change, please contact our support team immediately and secure your account.
					</Text>
				</Section>

				<Text class="mb-8 text-base leading-6 text-gray-700">
					{m.updatedpassword_contact()}
				</Text>

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
