<!--
@file src/components/emails/userToken.svelte
@component
**userToken Email component to send user token invite to email**
-->

<script lang="ts">
	import { dev } from '$app/environment';
	import { publicEnv } from '@src/stores/globalSettings.svelte';

	// Stores
	import { systemLanguage } from '@stores/store.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// svelte-email-tailwind
	import { Body, Button, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from 'svelte-email-tailwind';

	interface Props {
		email?: string;
		role?: string;
		token?: string;
		tokenLink?: string;
		expiresInLabel?: string | number;
		languageTag?: string;
	}

	let { email = '', role = '', token = '', tokenLink = '', expiresInLabel = '', languageTag = systemLanguage.value }: Props = $props();

	// The tokenLink is now passed directly from the API, no need to construct it here.
</script>

<Html lang={languageTag}>
	<Head>
		<title>Invitation to join {publicEnv.SITE_NAME}</title>
	</Head>
	<Preview preview="You have been invited to join {publicEnv.SITE_NAME}" />

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
				<Text>Hello there,</Text>

				<Text>
					You have been invited to join <strong>Svelty<span style="color:#22c55e;font-weight:bold;">CMS</span></strong> as a
					<strong>{role}</strong>. Please click the button below to create your account.
				</Text>
			</Section>

			<!-- User Information Box -->
			<Section style={{ backgroundColor: '#f8f9fa', padding: '16px', borderRadius: '8px', margin: '16px 0' }}>
				<Text style={{ fontSize: '14px', lineHeight: '1.5' }}>
					<strong>{m.usertoken_email()}</strong>
					{email}<br />
					<strong>{m.usertoken_role()}</strong>
					{role}<br />
					{#if expiresInLabel}
						<strong>{m.usertoken_valid()}</strong> {expiresInLabel}<br />
					{/if}
					<strong>{m.usertoken_token()}</strong>
					{token || (tokenLink ? tokenLink.split('invite_token=')[1] : 'N/A')}
				</Text>
			</Section>

			<!-- CTA Button -->
			<Section style={{ textAlign: 'center' }}>
				<Text style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '16px' }}>
					{m.usertoken_button()}
				</Text>
				<center>
					<Button
						href={tokenLink || '#'}
						pX={24}
						pY={12}
						style={{
							backgroundColor: '#22c55e',
							color: '#fff',
							borderRadius: '8px',
							minWidth: '200px',
							fontWeight: 'bold',
							fontSize: '18px',
							display: 'inline-block'
						}}
					>
						Accept Invitation & Create Account
					</Button>
				</center>
			</Section>

			<Section>
				<Text>This invitation is valid for a limited time and can only be used once.</Text>
			</Section>

			<!-- Fallback information for printed emails -->
			<Section>
				<Hr />
				<Text style={{ fontSize: '12px', color: '#666' }}>
					<strong>Can't click the link?</strong> Go to {publicEnv.HOST_PROD || publicEnv.HOST_DEV} and use the token above during signup.
				</Text>
			</Section>

			<Section>
				<Hr />
			</Section>

			<!-- Footer -->
			<Section>
				<Text style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '16px' }}>
					<Link href="https://SveltyCMS.com">
						Your <span style="color:#111;">Svelty</span><span style="color:#22c55e;font-weight:bold;">CMS</span> team
					</Link>
				</Text>
			</Section>
		</Container>
	</Body>
</Html>
