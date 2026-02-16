<!--
@file src/components/VersionCheck.svelte
@component **VersionCheck - Enhanced Svelte 5**

A dynamic component that compares the running application's version against the
latest version available on GitHub with comprehensive status reporting.

@props
- `transparent` (boolean): Renders a minimal semi-transparent overlay (default: false)
- `compact` (boolean): Shows just version number (default: false)
- `onStatusChange` (function): Callback that receives version status object
- `children` (Snippet): Custom rendering function for headless mode

### Features
- Fetches latest version from GitHub with caching
- Semantic version comparison (major, minor, patch)
- Security vulnerability detection
- Visual states: critical (red), update (yellow), current (green)
- Headless/renderless mode with Svelte 5 snippets
- Accessible with proper ARIA attributes
- Error handling with retry logic
- Reduced motion support
-->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { publicEnv } from '@stores/globalSettings.svelte';
	import { browser } from '$app/environment';
	import SystemTooltip from '@components/system/SystemTooltip.svelte';

	// Types
	type VersionStatus = {
		pkg: string;
		githubVersion: string;
		badgeVariant: 'variant-filled' | 'variant-soft' | 'variant-outline' | 'variant-glass';
		badgeColor: string;
		versionStatusMessage: string;
		statusIcon: string;
		statusSeverity: 'critical' | 'warning' | 'info' | 'success' | 'unknown';
		isLoading: boolean;
		error: string | null;
		lastChecked: number | null;
	};

	type VersionProps = {
		transparent?: boolean;
		compact?: boolean;
		onStatusChange?: (status: VersionStatus) => void;
		children?: import('svelte').Snippet<[VersionStatus]>;
	};

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
	let badgeColor = $state('bg-primary-500 text-white');
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
			return 'bg-primary-500/20 text-success-700 dark:text-success-300';
		} else if (badgeColor.includes('warning')) {
			return 'bg-warning-500/20 text-warning-700 dark:text-warning-300';
		} else if (badgeColor.includes('error')) {
			return 'bg-error-500/20 text-black';
		}
		return 'bg-surface-900/10 dark:text-white';
	});

	// Parse semantic version
	function parseVersion(version: string): [number, number, number] {
		const parts = version.split('.').map(Number);
		return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
	}

	// Compare versions
	function compareVersions(local: string, remote: string): 'major' | 'minor' | 'patch' | 'current' {
		const [localMajor, localMinor, localPatch] = parseVersion(local);
		const [remoteMajor, remoteMinor, remotePatch] = parseVersion(remote);

		if (remoteMajor > localMajor) return 'major';
		if (remoteMajor === localMajor && remoteMinor > localMinor) return 'minor';
		if (remoteMajor === localMajor && remoteMinor === localMinor && remotePatch > localPatch) return 'patch';
		return 'current';
	}

	interface VersionApiResponse {
		status: 'disabled' | 'error' | 'success';
		latest?: string;
		security_issue?: boolean;
		message?: string;
		error?: string;
	}

	// Update status based on version comparison
	function updateStatus(data: VersionApiResponse) {
		if (data.status === 'disabled') {
			githubVersion = pkg;
			badgeVariant = 'variant-filled';
			badgeColor = 'bg-surface-500 text-white';
			versionStatusMessage = 'Version check disabled';
			statusIcon = 'mdi:shield-off';
			statusSeverity = 'info';
			error = null;
		} else if (data.status === 'error') {
			githubVersion = pkg;
			badgeVariant = 'variant-filled';
			badgeColor = 'bg-warning-500 text-white';
			versionStatusMessage = 'Could not check for updates';
			statusIcon = 'mdi:wifi-off';
			statusSeverity = 'warning';
			error = data.error || 'Network error';
		} else {
			githubVersion = data.latest || pkg;
			const comparison = compareVersions(pkg, githubVersion);

			// Security issue takes priority
			if (data.security_issue) {
				badgeVariant = 'variant-filled';
				badgeColor = 'bg-error-500 text-white';
				versionStatusMessage = data.message || `Critical security update to v${githubVersion} available!`;
				statusIcon = 'mdi:shield-alert';
				statusSeverity = 'critical';
			} else if (comparison === 'major') {
				badgeVariant = 'variant-filled';
				badgeColor = 'bg-error-500 text-white';
				versionStatusMessage = `Major update to v${githubVersion} available`;
				statusIcon = 'mdi:alert-circle';
				statusSeverity = 'critical';
			} else if (comparison === 'minor' || comparison === 'patch') {
				badgeVariant = 'variant-filled';
				badgeColor = 'bg-warning-500 text-black';
				versionStatusMessage = `Update to v${githubVersion} recommended`;
				statusIcon = 'mdi:information';
				statusSeverity = 'warning';
			} else {
				badgeVariant = 'variant-filled';
				badgeColor = 'bg-primary-500 text-white';
				versionStatusMessage = 'You are up to date';
				statusIcon = 'mdi:check-circle';
				statusSeverity = 'success';
			}
			error = null;
		}

		lastChecked = Date.now();
	}

	// Fetch version with retry logic
	async function checkVersion(retry = 0): Promise<void> {
		if (isLoading && retry === 0) return; // Prevent duplicate requests

		isLoading = true;
		error = null;

		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

			const response = await fetch('/api/system/version', {
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
				setTimeout(() => checkVersion(retry + 1), RETRY_DELAY * Math.pow(2, retry));
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
</script>

{#if children}
	<!-- Headless mode - render custom UI via snippet -->
	{@render children(versionStatus)}
{:else}
	<!-- Default UI -->
	<SystemTooltip title={versionStatusMessage}>
		<a
			href={GITHUB_RELEASES_URL}
			target="_blank"
			rel="noopener noreferrer"
			class={effectiveTransparent
				? `absolute bottom-5 left-1/2 flex -translate-x-1/2 transform items-center justify-between w-28 gap-2 rounded-full ${transparentClasses} px-4 py-1 text-sm font-bold transition-opacity duration-300 hover:opacity-90  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2`
				: compact
					? `inline-flex items-center gap-1 text-xs font-medium transition-colors hover:opacity-80 focus:opacity-80 badge ${badgeVariant} ${badgeColor} rounded-full px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-primary-500`
					: `inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-80 focus:opacity-80 badge ${badgeVariant} ${badgeColor} rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500`}
			aria-label={statusAriaLabel}
			aria-live="polite"
		>
			{#if effectiveTransparent}
				<!-- Transparent mode -->
				<span class="text-black">Ver.</span>
				<span class="text-white">{pkg}</span>

				{#if !isLoading && statusSeverity === 'critical'}
					<span class="flex h-2 w-2">
						<span class="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-error-400 opacity-75"></span>
						<span class="relative inline-flex h-2 w-2 rounded-full bg-error-500"></span>
					</span>
				{/if}
			{:else}
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
									? 'bg-primary-500'
									: 'bg-surface-500'}"
						aria-hidden="true"
					></span>
				{/if}
			{/if}
		</a>
	</SystemTooltip>

	<!-- Error toast/message (optional - only shown if critical) -->
	{#if error && statusSeverity === 'critical' && !compact && !transparent}
		<div
			class="mt-2 rounded border-l-4 border-error-500 bg-error-50 p-2 text-xs text-error-700 dark:bg-error-900/20 dark:text-error-300"
			role="alert"
		>
			<strong>Version check failed:</strong>
			{error}
		</div>
	{/if}
{/if}
