<!--
@file src/components/emails/forgottenPassword.svelte
@component
**forgottenPassword Email component to reset password**
-->

<script lang="ts">
	import { dev } from '$app/environment';
	import { publicEnv } from '@src/stores/globalSettings.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { systemLanguage } from '@stores/store.svelte';
	// better-svelte-email
	import { Body, Button, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from 'better-svelte-email';
	// Readable ExpireIn time sec to year
	import { ReadableExpireIn } from '@utils/utils';

	interface Props {
		email?: string;
		token: string;
		resetLink: string;
		expiresIn: string;
		languageTag?: string;
	}

	const { email = '', token, resetLink, expiresIn, languageTag = systemLanguage.value }: Props = $props();

	// Use production host logo if available, otherwise fall back to GitHub
	const logoSrc = publicEnv?.HOST_PROD
		? `${publicEnv.HOST_PROD}/SveltyCMS.png`
		: 'https://github.com/SveltyCMS/SveltyCMS/raw/main/static/SveltyCMS.png';
</script>

<Html lang={languageTag}>
	<Head>
		<title>Reset your password for {publicEnv?.SITE_NAME ?? 'SveltyCMS'}</title>
	</Head>

	<Preview preview="Reset your password for {publicEnv?.SITE_NAME ?? 'SveltyCMS'}" />

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
				<Text style="font-size: 16px;">
					Hello <strong>{email}</strong>,
				</Text>

				<Text style="font-size: 16px;">
					You have requested to <strong>reset your password</strong> to get access to
					<strong>
						Svelty<span style="color:#22c55e;font-weight:bold;">CMS</span>.
					</strong>
				</Text>

				<!-- Token Information Box -->
				<Section>
					<Text><strong><center>{m.forgottenpassword_token()}</center></strong></Text>
					<Text
						style="text-align: center; font-weight: bold; background-color: #eee; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; color: #111827; margin-bottom: 12px;"
					>
						{token}
					</Text>
					<Text><strong><center>{m.forgottenpassword_valid()}</center></strong></Text>
					<Text
						style="text-align: center; font-weight: bold; background-color: #eee; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; color: #111827; margin-bottom: 12px;"
					>
						{ReadableExpireIn(expiresIn)}
					</Text>
				</Section>

				<Text>
					<center>{m.forgottenpassword_ignore()}</center>
				</Text>

				<!-- CTA Button -->
				<Section>
					<center>
						<Button
							href={resetLink}
							pX={24}
							pY={12}
							style="background-color: #22c55e; color: #fff; border-radius: 8px; min-width: 200px; font-weight: bold; font-size: 18px; display: inline-block;"
						>
							{m.forgottenpassword_resetbutton()}
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
