<!--
@file src/components/version-check.svelte
@component **VersionCheck - Enhanced Svelte 5**

A dynamic component that compares the running application's version against the
latest version available on GitHub with comprehensive status reporting.

@props
- `transparent` (boolean): Renders a minimal semi-transparent overlay (default: false)
- `compact` (boolean): Shows just version number (default: false)
- `onStatusChange` (function): Callback that receives version status object
- `children` (Snippet): Custom rendering function for headless mode

### Features
	- Fetches latest version from GitHub via the version service API
	- Visual states: update available (yellow), up to date (green)
	- Headless/renderless mode with Svelte 5 snippets
	- Accessible with proper ARIA attributes
	- Error handling with retry logic
	- Reduced motion support
-->
<script lang="ts">
	import Badge from '@components/ui/badge.svelte';
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { onDestroy, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import SystemTooltip from './system/system-tooltip.svelte';

	// Types
	interface VersionStatus {
		badgeColor: string;
		badgeVariant: 'variant-filled' | 'variant-soft' | 'variant-outline' | 'variant-glass';
		error: string | null;
		githubVersion: string;
		isLoading: boolean;
		lastChecked: number | null;
		pkg: string;
		statusIcon: string;
		statusSeverity: 'critical' | 'warning' | 'info' | 'success' | 'unknown';
		versionStatusMessage: string;
	}

	interface VersionProps {
		children?: import('svelte').Snippet<[VersionStatus]>;
		compact?: boolean;
		onStatusChange?: (status: VersionStatus) => void;
		transparent?: boolean;
	}

	const { transparent = false, compact = false, onStatusChange, children }: VersionProps = $props();

	// Constants
	const GITHUB_RELEASES_URL = 'https://github.com/SveltyCMS/SveltyCMS/releases';
	const CHECK_INTERVAL = 1000 * 60 * 60; // 1 hour
	const MAX_RETRIES = 3;
	const RETRY_DELAY = 2000;

	// State - use publicEnv directly instead of page.data
	const pkg = $derived(publicEnv?.PKG_VERSION || '0.0.0');
	let githubVersion = $state('');
	let badgeVariant = $state<'variant-filled' | 'variant-soft' | 'variant-outline' | 'variant-glass'>('variant-filled');
	let badgeColor = $state('bg-tertiary-500 dark:bg-primary-500 text-white');
	let versionStatusMessage = $state('Checking for updates...');
	let statusIcon = $state('mdi:loading');
	let statusSeverity = $state<'critical' | 'warning' | 'info' | 'success' | 'unknown'>('unknown');
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let lastChecked = $state<number | null>(null);
	let checkInterval: ReturnType<typeof setInterval> | null = null;

	// Derived state for full status object
	const versionStatus = $derived<VersionStatus>({
		pkg,
		githubVersion,
		badgeVariant,
		badgeColor,
		versionStatusMessage,
		statusIcon,
		statusSeverity,
		isLoading,
		error,
		lastChecked
	});

	// Transparent mode styling - check pathname defensively
	const isLoginRoute = $derived(browser ? window.location.pathname.startsWith('/login') : false);
	const effectiveTransparent = $derived(transparent || isLoginRoute);

	const transparentClasses = $derived.by(() => {
		if (badgeColor.includes('success')) {
			return 'bg-tertiary-500 dark:bg-primary-500/20 text-success-700 dark:text-success-300';
		}
		if (badgeColor.includes('warning')) {
			return 'bg-warning-500/20 text-warning-700 dark:text-warning-300';
		}
		if (badgeColor.includes('error')) {
			return 'bg-error-500/20 text-black';
		}
		return 'bg-surface-900/10 dark:text-white';
	});

	interface UpdateCheckData {
		currentVersion: string;
		latestVersion: string | null;
		updateAvailable: boolean;
		checkedAt: string;
		error?: string;
	}

	interface VersionApiResponse {
		success: boolean;
		data?: UpdateCheckData;
		message?: string;
	}

	// Update status based on /api/system/version/check response
	function updateStatus(raw: VersionApiResponse) {
		const check = raw?.data;

		if (!check) {
			githubVersion = pkg;
			badgeVariant = 'variant-filled';
			badgeColor = 'bg-surface-500 text-white';
			versionStatusMessage = 'Version check unavailable';
			statusIcon = 'mdi:shield-off';
			statusSeverity = 'info';
			error = 'No data received';
			lastChecked = Date.now();
			return;
		}

		if (check.error) {
			githubVersion = check.currentVersion || pkg;
			badgeVariant = 'variant-filled';
			badgeColor = 'bg-warning-500 text-white';
			versionStatusMessage = 'Could not check for updates';
			statusIcon = 'mdi:wifi-off';
			statusSeverity = 'warning';
			error = check.error;
		} else if (check.latestVersion && check.updateAvailable) {
			githubVersion = check.latestVersion;
			badgeVariant = 'variant-filled';
			badgeColor = 'bg-warning-500 text-black';
			versionStatusMessage = `Update to v${check.latestVersion} recommended`;
			statusIcon = 'mdi:information';
			statusSeverity = 'warning';
		} else {
			githubVersion = check.currentVersion || pkg;
			badgeVariant = 'variant-filled';
			badgeColor = 'bg-tertiary-500 dark:bg-primary-500 text-white';
			versionStatusMessage = 'You are up to date';
			statusIcon = 'mdi:check-circle';
			statusSeverity = 'success';
		}

		lastChecked = Date.now();
	}

	// Fetch version with retry logic
	async function checkVersion(retry = 0): Promise<void> {
		if (isLoading && retry === 0) {
			return; // Prevent duplicate requests
		}

		isLoading = true;
		error = null;

		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout

			const response = await fetch('/api/system/version/check', {
				signal: controller.signal,
				headers: {
					'Content-Type': 'application/json'
				}
			});

			clearTimeout(timeout);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = await response.json();
			updateStatus(data);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Unknown error';

			if (retry < MAX_RETRIES) {
				setTimeout(() => checkVersion(retry + 1), RETRY_DELAY * 2 ** retry);
			} else {
				githubVersion = pkg;
				badgeVariant = 'variant-soft';
				badgeColor = 'bg-surface-500 text-white';
				versionStatusMessage = 'Update check failed';
				statusIcon = 'mdi:alert-octagon';
				statusSeverity = 'unknown';
				error = errorMessage;
			}
		} finally {
			isLoading = false;
		}
	}

	// Notify parent of status changes
	$effect(() => {
		if (onStatusChange && !isLoading) {
			onStatusChange(versionStatus);
		}
	});

	// Setup periodic checks
	onMount(() => {
		// Initial check
		checkVersion();

		// Periodic checks every hour
		checkInterval = setInterval(() => {
			checkVersion();
		}, CHECK_INTERVAL);

		return () => {
			if (checkInterval) {
				clearInterval(checkInterval);
			}
		};
	});

	onDestroy(() => {
		if (checkInterval) {
			clearInterval(checkInterval);
		}
	});

	// Get appropriate ARIA label
	const statusAriaLabel = $derived.by(() => {
		if (isLoading) {
			return 'Checking application version';
		}
		if (error) {
			return `Version ${pkg}. ${error}`;
		}
		return `Application version ${pkg}. ${versionStatusMessage}`;
	});

	// Map statusSeverity to Badge variant
	const severityVariant = $derived.by(() => {
		switch (statusSeverity) {
			case 'success': return 'success' as const;
			case 'warning': return 'warning' as const;
			case 'critical': return 'error' as const;
			case 'info': return 'surface' as const;
			default: return 'surface' as const;
		}
	});
</script>

{#if children}
	<!-- Headless mode - render custom UI via snippet -->
	{@render children(versionStatus)}
{:else}
	{#if effectiveTransparent}
		<a
			href={GITHUB_RELEASES_URL}
			target="_blank"
			rel="noopener noreferrer"
			class={`absolute bottom-5 inset-s-1/2 flex -translate-x-1/2 transform items-center justify-between w-28 gap-2 rounded-full ${transparentClasses} px-4 py-1 text-sm font-bold transition-opacity duration-300 hover:opacity-90  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2`}
			aria-label={statusAriaLabel}
			aria-live="polite"
		>
			<!-- Transparent mode -->
			<span class="text-black">Ver.</span>
			<span class="text-white">{pkg}</span>

			{#if !isLoading && statusSeverity === 'critical'}
				<span class="flex h-2 w-2">
					<span class="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-error-400 opacity-75"></span>
					<span class="relative inline-flex h-2 w-2 rounded-full bg-error-500"></span>
				</span>
			{/if}
		</a>
	{:else}
		<SystemTooltip title={versionStatusMessage}>
			<Badge
				href={GITHUB_RELEASES_URL}
				target="_blank"
				rel="noopener noreferrer"
				variant={severityVariant}
				size="md"
				class={compact
					? 'inline-flex items-center gap-1 text-xs font-medium transition-colors hover:opacity-80 focus:opacity-80 px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-primary-500'
					: 'inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-80 focus:opacity-80 focus:outline-none focus:ring-2 focus:ring-primary-500'}
				aria-label={statusAriaLabel}
				aria-live="polite"
			>
				<!-- Standard/Compact mode -->
				<span>
					{#if compact}
						v.{pkg}
					{:else}
						Ver. {pkg}
						{#if githubVersion && githubVersion !== pkg && !isLoading}
							<span class="opacity-70">→ {githubVersion}</span>
						{/if}
					{/if}
				</span>

				<!-- Status indicator dot (only show when check is complete) -->
				{#if !compact && !isLoading && statusSeverity !== 'unknown'}
					<span
						class="inline-block h-2 w-2 rounded-full {statusSeverity === 'critical'
							? 'bg-error-500'
							: statusSeverity === 'warning'
								? 'bg-warning-500'
								: statusSeverity === 'success'
									? 'bg-tertiary-500 dark:bg-primary-500'
									: 'bg-surface-500'}"
						aria-hidden="true"
					></span>
				{/if}
			</Badge>
		</SystemTooltip>
	{/if}

	<!-- Error toast/message (optional - only shown if critical) -->
	{#if error && statusSeverity === 'critical' && !compact && !transparent}
		<div
			class="mt-2 rounded border-s-4 border-error-500 bg-error-50 p-2 text-xs text-error-700 dark:bg-error-900/20 dark:text-error-300"
			role="alert"
		>
			<strong>Version check failed:</strong>
			{error}
		</div>
	{/if}
{/if}
