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

	<Body class="bg-gray-50 font-sans">
		<Container class="mx-auto max-w-2xl bg-white">
			<!-- Header Section -->
			<Section class="py-8 text-center">
				<Link href={finalTokenLink} class="inline-block">
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
					Hello {username}
				</Text>

				<Text class="mb-6 text-base leading-6 text-gray-700">
					You have been invited to join {publicEnv.SITE_NAME} as {role}.
				</Text>

				<!-- User Information Box -->
				<Section class="mb-6 rounded-lg bg-gray-100 p-6">
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div>
							<Text class="mb-1 text-sm font-medium text-gray-600">
								{m.usertoken_email()}
							</Text>
							<Text class="mb-4 text-base font-semibold text-gray-900">
								{email}
							</Text>

							<Text class="mb-1 text-sm font-medium text-gray-600">
								{m.usertoken_role()}
							</Text>
							<Text class="mb-4 text-base font-semibold text-gray-900">
								{role}
							</Text>
						</div>

						<div>
							<Text class="mb-1 text-sm font-medium text-gray-600">
								{m.usertoken_token()}
							</Text>
							<Text class="mb-4 break-all rounded border bg-white p-2 font-mono text-sm text-gray-900">
								{token}
							</Text>

							<Text class="mb-1 text-sm font-medium text-gray-600">
								{m.usertoken_valid()}
							</Text>
							<Text class="text-sm font-semibold text-red-600">Valid for limited time</Text>
						</div>
					</div>
				</Section>

				<Text class="mb-8 text-center text-base leading-6 text-gray-700">
					{m.usertoken_button()}
				</Text>

				<!-- CTA Button -->
				<Section class="mb-8 text-center">
					<Button
						href={finalTokenLink}
						class="text-decoration-none inline-block rounded-lg bg-green-500 px-6 py-3 font-semibold text-white transition-colors duration-200 hover:bg-green-600"
					>
						{m.usertoken_createuser()}
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
