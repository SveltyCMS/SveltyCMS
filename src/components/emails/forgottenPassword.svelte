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
	import { Html, Head, Preview, Body, Container, Section, Text, Link, Img, Button, Hr, Custom } from 'svelte-email-tailwind';

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
				<Text style={{ fontSize: '16px' }}>
					Hello <strong>{email}</strong>,
				</Text>

				<Text style={{ fontSize: '16px' }}>
					You have requested to <strong>reset your password</strong> to get access to
					<strong>{publicEnv.SITE_NAME}.</strong>
				</Text>

				<!-- Token Information Box -->
				<Section>
					<Text><strong><center>{m.forgottenpassword_token()}</center></strong></Text>
					<Text
						style={{
							textAlign: 'center',
							fontWeight: 'bold',
							backgroundColor: '#eee',
							border: '1px solid #e5e7eb',
							borderRadius: '6px',
							padding: '12px',
							color: '#111827',
							marginBottom: '12px'
						}}
					>
						{token}
					</Text>
					<Text><strong><center>{m.forgottenpassword_valid()}</center></strong></Text>
					<Text
						style={{
							textAlign: 'center',
							fontWeight: 'bold',
							backgroundColor: '#eee',
							border: '1px solid #e5e7eb',
							borderRadius: '6px',
							padding: '12px',
							color: '#111827',
							marginBottom: '12px'
						}}
					>
						{ReadableExpireIn(expiresIn)}
					</Text>
				</Section>

				<Text>
					<center>{m.forgottenpassword_ignore()}</center>
				</Text>

				<Text>
					<center>{m.forgottenpassword_button()}</center>
				</Text>

				<!-- CTA Button -->
				<Section>
					<Button href={resetLink} pX={24} pY={12} style={{ backgroundColor: '#22c55e', color: '#fff', borderRadius: '8px' }}>
						{m.forgottenpassword_resetbutton()}
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
