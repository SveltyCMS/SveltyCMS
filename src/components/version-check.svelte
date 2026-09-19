<!--
@file src/components/version-check.svelte
@component **VersionCheck**

Compares the running version (`publicEnv.PKG_VERSION`) against the latest GitHub
release reported by `GET /api/system/version/check` and links to the releases page.

Every presentation value (colour, icon, message, severity) is derived from a single
state object — no parallel `$state` variables, no shadow copies — and the release is
refreshed by one mechanism: the hourly interval below.

@props
- `transparent` (boolean): Renders the minimal semi-transparent overlay (default: false; forced on /login)
- `compact` (boolean): Shows just the version number (default: false)
- `onStatusChange` (function): Receives the resolved status object after every check
- `children` (Snippet): Headless mode (`{#snippet children(status)}`)

### Features
	- Single state object + severity-keyed presentation
	- Up to date (success), update available (warning), GitHub error (warning),
	  unreachable (critical), no data (info)
	- Accessible ARIA status label + polite live region; reduced-motion safe
-->

<script lang="ts">
	import Badge from '@components/ui/badge.svelte';
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { logger } from '@utils/logger';
	import { onMount } from 'svelte';
	import { browser } from '$app/env';
	import SystemTooltip from './system/system-tooltip.svelte';

	/** Payload of GET /api/system/version/check — see handlers/system.ts. */
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

	type BadgeKind = 'success' | 'warning' | 'error' | 'surface';
	type BadgeVariant = 'filled' | 'tonal' | 'outlined' | 'ghost';
	type Severity = 'critical' | 'warning' | 'info' | 'success' | 'unknown';

	/** Status object handed to `onStatusChange` and the headless `children` snippet. */
	interface VersionStatus {
		badgeColor: string;
		badgeVariant: BadgeVariant;
		error: string | null;
		githubVersion: string;
		isLoading: boolean;
		lastChecked: number | null;
		pkg: string;
		statusIcon: string;
		statusSeverity: Severity;
		versionStatusMessage: string;
	}

	interface VersionProps {
		children?: import('svelte').Snippet<[VersionStatus]>;
		compact?: boolean;
		onStatusChange?: (status: VersionStatus) => void;
		transparent?: boolean;
	}

	const { transparent = false, compact = false, onStatusChange, children }: VersionProps = $props();

	const GITHUB_RELEASES_URL = 'https://github.com/SveltyCMS/SveltyCMS/releases';
	const CHECK_ENDPOINT = '/api/system/version/check';
	const FETCH_TIMEOUT_MS = 10_000;
	/**
	 * Single refresh mechanism: the installed version only changes on redeploy, but the
	 * latest release can — and the next tick also retries a failed check. The former
	 * 2s/4s/8s retry loop was redundant, and it skipped the initial check entirely
	 * because its guard read the still-loading state.
	 */
	const CHECK_INTERVAL_MS = 1000 * 60 * 60;

	/** What the check resolved to; `loading` until the first response arrives. */
	type CheckOutcome = 'loading' | 'current' | 'update' | 'remote-error' | 'unreachable' | 'unavailable';

	interface CheckState {
		error: string | null;
		lastChecked: number | null;
		latestVersion: string | null;
		outcome: CheckOutcome;
		/** `currentVersion` as reported by the API (null when nothing answered). */
		remoteVersion: string | null;
	}

	/** Icon, message and severity per outcome — the only per-outcome presentation data. */
	const PRESENTATION: Record<CheckOutcome, { icon: string; message: string; severity: Severity }> = {
		loading: { icon: 'mdi:loading', message: 'Checking for updates...', severity: 'unknown' },
		current: { icon: 'mdi:check-circle', message: 'You are up to date', severity: 'success' },
		update: { icon: 'mdi:information', message: 'Update available', severity: 'warning' },
		'remote-error': { icon: 'mdi:wifi-off', message: 'Could not check for updates', severity: 'warning' },
		unreachable: { icon: 'mdi:alert-octagon', message: 'Update check failed', severity: 'critical' },
		unavailable: { icon: 'mdi:shield-off', message: 'Version check unavailable', severity: 'info' }
	};

	/** Rendered Badge variant, status dot and transparent-overlay classes per severity. */
	const SEVERITY_STYLES: Record<Severity, { badge: BadgeKind; dot: string; transparent: string }> = {
		success: { badge: 'success', dot: 'bg-tertiary-500 dark:bg-primary-500', transparent: 'bg-tertiary-500 dark:bg-primary-500/20 text-success-600 dark:text-success-400' },
		warning: { badge: 'warning', dot: 'bg-warning-500', transparent: 'bg-warning-500/20 text-warning-600 dark:text-warning-400' },
		critical: { badge: 'error', dot: 'bg-error-500', transparent: 'bg-error-500/20 text-black' },
		info: { badge: 'surface', dot: 'bg-surface-500', transparent: 'bg-surface-900/10 dark:text-white' },
		unknown: { badge: 'surface', dot: 'bg-surface-500', transparent: 'bg-surface-900/10 dark:text-white' }
	};

	/** Informational fill for `VersionStatus.badgeColor`; the rendered badge uses `variant`. */
	const SEVERITY_FILL: Record<Severity, string> = {
		success: 'bg-tertiary-500 dark:bg-primary-500 text-white',
		warning: 'bg-warning-500 text-white',
		critical: 'bg-surface-500 text-white',
		info: 'bg-surface-500 text-white',
		unknown: 'bg-surface-500 text-white'
	};

	const pkg = $derived(publicEnv?.PKG_VERSION || '0.0.0');

	let state = $state<CheckState>({
		error: null,
		lastChecked: null,
		latestVersion: null,
		outcome: 'loading',
		remoteVersion: null
	});

	const presentation = $derived(PRESENTATION[state.outcome]);
	const severityStyle = $derived(SEVERITY_STYLES[presentation.severity]);
	const githubVersion = $derived(
		state.outcome === 'update' && state.latestVersion ? state.latestVersion : state.remoteVersion || pkg
	);
	const isLoading = $derived(state.outcome === 'loading');
	const versionStatusMessage = $derived(
		state.outcome === 'update' && state.latestVersion
			? `Update to v${state.latestVersion} recommended`
			: presentation.message
	);

	/** Resolved status — the callback prop and headless snippets consume this shape. */
	const versionStatus = $derived<VersionStatus>({
		pkg,
		githubVersion,
		badgeColor: SEVERITY_FILL[presentation.severity],
		badgeVariant: 'filled',
		versionStatusMessage,
		statusIcon: presentation.icon,
		statusSeverity: presentation.severity,
		isLoading,
		error: state.error,
		lastChecked: state.lastChecked
	});

	// Transparent mode styling - check pathname defensively
	const isLoginRoute = $derived(browser ? window.location.pathname.startsWith('/login') : false);
	const effectiveTransparent = $derived(transparent || isLoginRoute);

	// Get appropriate ARIA label
	const statusAriaLabel = $derived.by(() => {
		if (isLoading) {
			return 'Checking application version';
		}
		if (state.error) {
			return `Version ${pkg}. ${state.error}`;
		}
		return `Application version ${pkg}. ${versionStatusMessage}`;
	});

	/** Maps one API payload onto the single state object. */
	function toState(data: UpdateCheckData | null): CheckState {
		const lastChecked = Date.now();

		if (!data) {
			return { error: 'No data received', lastChecked, latestVersion: null, outcome: 'unavailable', remoteVersion: null };
		}
		if (data.error) {
			return { error: data.error, lastChecked, latestVersion: null, outcome: 'remote-error', remoteVersion: data.currentVersion || null };
		}
		return {
			error: null,
			lastChecked,
			latestVersion: data.latestVersion,
			outcome: data.latestVersion && data.updateAvailable ? 'update' : 'current',
			remoteVersion: data.currentVersion || null
		};
	}

	async function checkVersion(): Promise<void> {
		try {
			const response = await fetch(CHECK_ENDPOINT, {
				headers: { Accept: 'application/json' },
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const body: VersionApiResponse = await response.json();
			state = toState(body?.data ?? null);
		} catch (err) {
			const message = err instanceof Error ? err.message || err.name : 'Unknown error';
			logger.debug(`[VersionCheck] Update check failed: ${message}`);
			state = { error: message, lastChecked: Date.now(), latestVersion: null, outcome: 'unreachable', remoteVersion: null };
		} finally {
			if (!isLoading) onStatusChange?.(versionStatus);
		}
	}

	onMount(() => {
		void checkVersion();

		const interval = setInterval(() => void checkVersion(), CHECK_INTERVAL_MS);
		return () => clearInterval(interval);
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
			class={`absolute bottom-5 inset-s-1/2 flex -translate-x-1/2 transform items-center justify-between w-28 gap-2 rounded-full ${severityStyle.transparent} px-4 py-1 text-sm font-bold transition-opacity duration-300 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2`}
			aria-label={statusAriaLabel}
			aria-live="polite"
		>
			<!-- Transparent mode -->
			<span class="text-black">Ver.</span>
			<span class="text-white">{pkg}</span>

			{#if !isLoading && presentation.severity === 'critical'}
				<span class="flex h-2 w-2">
					<span class="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-error-400 opacity-75 motion-reduce:hidden"></span>
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
				variant={severityStyle.badge}
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
				{#if !compact && !isLoading && presentation.severity !== 'unknown'}
					<span class="inline-block h-2 w-2 rounded-full {severityStyle.dot}" aria-hidden="true"></span>
				{/if}
			</Badge>
		</SystemTooltip>
	{/if}

	<!-- Error toast/message (optional - only shown if critical) -->
	{#if state.error && presentation.severity === 'critical' && !compact && !transparent}
		<div
			class="mt-2 rounded border-s-4 border-error-500 bg-error-500/10 p-2 text-xs text-error-600 dark:bg-error-900/20 dark:text-error-400"
			role="alert"
		>
			<strong>Version check failed:</strong>
			{state.error}
		</div>
	{/if}
{/if}
