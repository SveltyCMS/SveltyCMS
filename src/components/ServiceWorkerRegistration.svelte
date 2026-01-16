<!--
@file src/components/ServiceWorkerRegistration.svelte
@component
**Service Worker Registration Component**

Registers and manages the service worker for offline support and caching.

@example
<ServiceWorkerRegistration />

### Features
- Automatic service worker registration
- Update notification
- Cache management
- Development mode detection
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { logger } from '@utils/logger';

	let updateAvailable = $state(false);
	let registration: ServiceWorkerRegistration | null = $state(null);

	onMount(() => {
		// Only register in production and in browser
		if (!browser || import.meta.env.DEV) {
			return;
		}

		// Check if service worker is supported
		if (!('serviceWorker' in navigator)) {
			return;
		}

		registerServiceWorker();
	});

	async function registerServiceWorker() {
		try {
			registration = await navigator.serviceWorker.register('/service-worker.js', {
				scope: '/'
			});

			// Check for updates every hour
			setInterval(
				() => {
					registration?.update();
				},
				60 * 60 * 1000
			);

			// Listen for updates
			registration.addEventListener('updatefound', () => {
				const newWorker = registration!.installing;

				newWorker?.addEventListener('statechange', () => {
					if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
						// New service worker available
						updateAvailable = true;
					}
				});
			});

			// Handle controller change (new SW activated)
			navigator.serviceWorker.addEventListener('controllerchange', () => {
				window.location.reload();
			});
		} catch (error) {
			logger.error('[ServiceWorker] Registration failed:', error);
		}
	}

	function updateServiceWorker() {
		if (registration?.waiting) {
			// Tell the service worker to skip waiting
			registration.waiting.postMessage({ type: 'SKIP_WAITING' });
		}
	}

	function clearCache() {
		if (registration?.active) {
			registration.active.postMessage({ type: 'CLEAR_CACHE' });
		}
	}
</script>

{#if updateAvailable}
	<!-- Update notification -->
	<div class="card preset-filled-primary-500 fixed bottom-4 right-4 z-50 max-w-sm p-4 shadow-xl">
		<div class="flex items-center gap-3">
			<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
				/>
			</svg>
			<div class="flex-1">
				<h3 class="text-sm font-semibold">Update Available</h3>
				<p class="text-xs opacity-90">A new version of the app is ready.</p>
			</div>
		</div>
		<div class="mt-3 flex gap-2">
			<button class="preset-ghost-surface-500 btn btn-sm" onclick={updateServiceWorker}> Update Now </button>
			<button class="preset-ghost btn btn-sm" onclick={() => (updateAvailable = false)}> Later </button>
		</div>
	</div>
{/if}

<!-- Debug tools (only in dev mode) -->
{#if import.meta.env.DEV && browser}
	<div class="card preset-soft-surface-500 fixed bottom-4 left-4 z-50 p-2 text-xs">
		<button class="preset-ghost btn btn-sm" onclick={clearCache}> Clear Cache </button>
	</div>
{/if}
