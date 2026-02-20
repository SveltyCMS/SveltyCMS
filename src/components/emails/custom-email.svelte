<script lang="ts">
	/**
	 * @file src/components/emails/custom-email.svelte
	 * @component
	 * Generic email template for custom content
	 */

	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { dev } from '$app/environment';

	interface Props {
		body?: string;
		hostLink?: string;
		languageTag?: string;
		sitename?: string;
	}

	const {
		sitename = publicEnv?.SITE_NAME || 'SveltyCMS',
		body = '',
		hostLink = dev ? publicEnv?.HOST_DEV : publicEnv?.HOST_PROD || 'http://localhost:5173',
		languageTag = 'en'
	}: Props = $props();

	const logoSrc = publicEnv?.HOST_PROD
		? `${publicEnv.HOST_PROD}/SveltyCMS.png`
		: 'https://github.com/SveltyCMS/SveltyCMS/raw/main/static/SveltyCMS.png';
</script>

<Html lang={languageTag}>
	<Head>
		<title>{sitename} Notification</title>
	</Head>

	<Preview preview="A notification from {sitename}" />

	<Body class="font-sans bg-[#f6f9fc] py-5">
		<Container class="max-w-[600px] mx-auto bg-white rounded-lg overflow-hidden shadow-sm">
			<Section class="p-8 text-center border-b border-gray-200">
				<Link href={hostLink}><Img src={logoSrc} alt="{sitename} logo" width="120" height="auto" class="mx-auto block" /></Link>
			</Section>

			<Section class="p-6">
				<!-- Custom body injected here -->
				<div class="prose prose-slate max-w-none">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html body}
				</div>
			</Section>

			<Hr class="mx-6 border-gray-200" />

			<Section class="p-6 text-center">
				<Text class="text-gray-500 text-xs mb-2">This is an automated notification from <strong>{sitename}</strong>.</Text>
				<Text class="text-gray-400 text-[10px] uppercase tracking-wider">Server: {hostLink}</Text>
			</Section>
		</Container>
	</Body>
</Html>
