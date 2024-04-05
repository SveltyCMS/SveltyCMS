<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import { page } from '$app/stores';

	// Icons from https://icon-sets.iconify.design/
	import 'iconify-icon';

	// Your selected Skeleton theme:
	import '../app.postcss';

	// Skeleton
	import { initializeStores } from '@skeletonlabs/skeleton';
	initializeStores();

	// Paraglide JS
	import ParaglideSvelteKit from '@components/ParaglideSvelteKit.svelte';

	// Import DeviceManager
	import DeviceIdManager from '@src/components/system/DeviceIdManager.svelte';
	// Check for existing device_id in localStorage
	import { device_id } from '@stores/store';
	let existingDeviceId: string | null = localStorage.getItem('device_id');

	// Validate and update the device_id store
	if (existingDeviceId) {
		const storedDeviceId = $device_id;

		// Check if the stored device_id matches the one in localStorage
		if (storedDeviceId !== existingDeviceId) {
			// Update the device_id store with the value from localStorage
			device_id.set(existingDeviceId);
			//console.log('Updated device_id store:', existingDeviceId);
		}
	} else {
		// Generate a new UUID if device_id is not in localStorage
		existingDeviceId = crypto.randomUUID();
		localStorage.setItem('device_id', existingDeviceId);
		device_id.set(existingDeviceId);
		//console.log('Generated device_id:', existingDeviceId);
	}
	// SEO
	const SeoTitle = `${publicEnv.SITE_NAME} - powered with sveltekit`;
	const SeoDescription = `${publicEnv.SITE_NAME} - a modern, powerful, and easy-to-use CMS powered by SvelteKit. Manage your content with ease & take advantage of the latest web technologies.`;
</script>

<svelte:head>
	<!--Basic SEO-->
	<title>{SeoTitle}</title>
	<meta name="description" content={SeoDescription} />

	<!-- Open Graph -->
	<meta property="og:title" content={SeoTitle} />
	<meta property="og:description" content={SeoDescription} />
	<meta property="og:type" content="website" />
	<meta property="og:image" content="/SveltyCMS.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:site_name" content={$page.url.origin} />

	<!-- Open Graph : Twitter-->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={SeoTitle} />
	<meta name="twitter:description" content={SeoDescription} />
	<meta name="twitter:image" content="/SveltyCMS.png" />
	<meta property="twitter:domain" content={$page.url.origin} />
	<meta property="twitter:url" content={$page.url.href} />
</svelte:head>

<ParaglideSvelteKit>
	<slot />
</ParaglideSvelteKit>
