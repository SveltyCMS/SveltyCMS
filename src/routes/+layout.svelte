<!--
 @file src/routes/+layout.svelte
 @component
 **This Svelte component serves as the layout for the entire application**

 ### Props
 - `children?`: import('svelte').Snippet

 ### Features
 - Theme Management
 -->

<script lang="ts">
	// Selected theme:
	import '../app.css';
	// Register Iconify custom element globally
	import 'iconify-icon';

	import { page } from '$app/state';
	import { onMount } from 'svelte';

	// Paraglide locale bridge
	import { locales as availableLocales, getLocale, setLocale } from '@src/paraglide/runtime';

	import { systemLanguage } from '@stores/store.svelte';
	// Centralized theme management
	import { themeStore, initializeThemeStore, initializeDarkMode } from '@stores/themeStore.svelte';
	import DialogManager from '@components/system/DialogManager.svelte';

	// Skeleton Toaster
	import { toaster } from '@stores/store.svelte';
	import { Toast } from '@skeletonlabs/skeleton-svelte';

	// Initialize theme and other client-side logic on mount
	onMount(() => {
		console.log('[RootLayout] Mounting...');
		initializeDarkMode();
	});

	let currentLocale = $state(getLocale());
	$effect(() => {
		const desired = systemLanguage.value;
		if (desired && availableLocales.includes(desired as any) && currentLocale !== desired) {
			setLocale(desired as any, { reload: false });
			currentLocale = desired;
		}
	});

	// Auto-refresh logic for theme
	$effect(() => {
		if (!themeStore.autoRefreshEnabled) return;

		const interval = 30 * 60 * 1000; // 30 minutes
		const intervalId = setInterval(() => {
			initializeThemeStore().catch(console.error);
		}, interval);

		return () => {
			clearInterval(intervalId);
		};
	});

	// Props
	interface Props {
		children?: import('svelte').Snippet;
	}

	const { children }: Props = $props();

	// Get the site name from data loaded in layout.server.ts
	const siteName = $derived(page.data.settings?.SITE_NAME || 'SveltyCMS');
</script>

<svelte:head>
	<title>{siteName}</title>
</svelte:head>

{#key currentLocale}
	<DialogManager />
	<Toast.Group {toaster}>
		{#snippet children(toast)}
			<Toast
				{toast}
				class="min-w-[300px] max-w-[400px] shadow-lg backdrop-blur-md dark:bg-surface-800/90 bg-white/90 border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden"
			>
				<Toast.Message class="flex flex-col gap-1 p-4 pr-8 relative">
					{#if toast.title}
						<Toast.Title class="font-bold text-base">{toast.title}</Toast.Title>
					{/if}
					<Toast.Description class="text-sm opacity-90">{toast.description}</Toast.Description>
				</Toast.Message>
				<Toast.CloseTrigger
					class="absolute right-2 top-2 p-1.5 hover:bg-surface-500/10 rounded-full transition-colors opacity-60 hover:opacity-100"
				/>
			</Toast>
		{/snippet}
	</Toast.Group>
	{@render children?.()}
{/key}
