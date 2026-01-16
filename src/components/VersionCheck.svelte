<!--
@file src/components/VersionCheck.svelte
@component VersionCheck

@summary
A dynamic component that compares the running application's version against the
latest version available on GitHub. It provides visual feedback and can be
used as a renderless component to supply version status to custom UI.

@props
- `transparent` (boolean, optional, default: false): If true, renders a minimal,
  semi-transparent version with color-coded background (red for major updates, 
  yellow for minor updates, green for up-to-date) suitable for overlays. 
  Defaults to a standard badge style.
- `onStatusChange` (function, optional): A callback function that receives the final
  version status object after the check is complete.
- `children` (Snippet, optional): A Svelte 5 snippet that receives the version status
  as an object. If provided, the component will be "headless" and render the snippet
  instead of its default UI.

@slot children (scope: { pkg, githubVersion, pkgBgColor, versionStatusMessage, statusIcon, isLoading })
The `children` snippet is passed an object with the following properties:
- `pkg`: The local application version.
- `githubVersion`: The latest version fetched from GitHub.
- `pkgBgColor`: A TailwindCSS color class based on the version status.
- `versionStatusMessage`: A human-readable status message.
- `statusIcon`: An iconify icon name for the status.
- `isLoading`: A boolean indicating if the version check is in progress.

### Features
- Fetches the latest version from the project's GitHub repository.
- Compares semantic versions (major, minor, patch).
- Provides distinct visual states for major updates (red), minor updates (yellow), and up-to-date (green).
- Functions as a renderless component using Svelte 5 snippets.
- Offers a default UI with standard and transparent variants with color coding.

### Visual States / Styling Notes:
- **Version States**: The application utilizes three visual states: red, yellow, and green, likely indicating different statuses or versions of content.
- **Login Page Styling**: For the `/login` route, any badge background will always be transparent. This is to ensure text color changes remain visible against the varying background, rather than being obscured by a badge background.
-->
<script lang="ts">
	import { page } from '$app/state';

	type VersionStatus = {
		pkg: string;
		githubVersion: string;
		pkgBgColor: string;
		versionStatusMessage: string;
		statusIcon: string;
		isLoading: boolean;
	};

	type VersionProps = {
		transparent?: boolean;
		compact?: boolean; // New prop to show compact version (just version number)
		onStatusChange?: (status: VersionStatus) => void;
		children?: import('svelte').Snippet<[VersionStatus]>;
	};

	const { transparent = false, compact = false, onStatusChange, children }: VersionProps = $props();

	// --- State Management ---
	// Use the pkg version passed from the server load function
	const pkg = $derived(page.data?.settings?.PKG_VERSION || '0.0.0');
	let githubVersion = $state('');
	let pkgBgColor = $state('preset-soft-surface-500'); // Default neutral color
	let versionStatusMessage = $state('Checking for updates...');
	let statusIcon = $state('mdi:loading');
	let isLoading = $state(true);

	// --- Logic ---
	$effect(() => {
		// Fetch from internal API which handles caching and telemetry logic
		fetch('/api/system/version')
			.then((response) => response.json())
			.then((data) => {
				if (data.status === 'disabled') {
					githubVersion = pkg;
					pkgBgColor = 'preset-filled-surface-500';
					versionStatusMessage = 'Security Status: Unknown (Telemetry Disabled)';
					statusIcon = 'mdi:shield-off';
				} else if (data.status === 'error') {
					githubVersion = pkg;
					pkgBgColor = 'preset-filled-warning-500';
					versionStatusMessage = 'Could not check for updates';
					statusIcon = 'mdi:wifi-off';
				} else {
					githubVersion = data.latest || pkg;
					const [localMajor, localMinor, localPatch] = pkg.split('.').map(Number);
					const [githubMajor, githubMinor, githubPatch] = githubVersion.split('.').map(Number);

					if (data.security_issue) {
						pkgBgColor = 'preset-filled-error-500';
						versionStatusMessage = data.message || `Critical security update to v${githubVersion} available!`;
						statusIcon = 'mdi:shield-alert';
					} else if (githubMajor > localMajor) {
						pkgBgColor = 'preset-filled-error-500';
						versionStatusMessage = `Major update to v${githubVersion} available!`;
						statusIcon = 'mdi:alert-circle';
					} else if (githubMinor > localMinor || (githubMinor === localMinor && githubPatch > localPatch)) {
						pkgBgColor = 'preset-filled-warning-500';
						versionStatusMessage = `Update to v${githubVersion} recommended`;
						statusIcon = 'mdi:information';
					} else {
						pkgBgColor = 'preset-filled-success-500';
						versionStatusMessage = 'You are up to date';
						statusIcon = 'mdi:check-circle';
					}
				}
			})
			.catch(() => {
				githubVersion = pkg;
				pkgBgColor = 'preset-soft-surface-500';
				versionStatusMessage = 'Update check failed';
				statusIcon = 'mdi:loading';
			})
			.finally(() => {
				isLoading = false;
				if (onStatusChange) {
					onStatusChange({ pkg, githubVersion, pkgBgColor, versionStatusMessage, statusIcon, isLoading });
				}
			});
	});

	// Transparent mode styling based on status
	let transparentColorClass = $state('bg-surface-900/10 text-white');

	$effect(() => {
		if (pkgBgColor.includes('success')) {
			transparentColorClass = 'bg-success-500/20 text-success-700 dark:text-success-300';
		} else if (pkgBgColor.includes('warning')) {
			transparentColorClass = 'bg-warning-500/20 text-warning-700 dark:text-warning-300';
		} else if (pkgBgColor.includes('error')) {
			transparentColorClass = 'bg-error-500/20 text-error-700 dark:text-error-300';
		} else {
			transparentColorClass = 'bg-surface-900/10 text-black dark:text-white';
		}
	});
</script>

{#if children}
	{@render children({ pkg, githubVersion, pkgBgColor, versionStatusMessage, statusIcon, isLoading })}
{:else}
	<a
		href="https://github.com/SveltyCMS/SveltyCMS/releases"
		target="_blank"
		rel="noopener noreferrer"
		class:badge={!transparent && !compact}
		class:animate-pulse={isLoading}
		class={transparent
			? `absolute bottom-5 left-1/2 flex -translate-x-1/2 transform items-center justify-center gap-2 rounded-full bg-linear-to-r ${transparentColorClass} px-3 py-1 text-sm font-medium transition-opacity duration-300`
			: compact
				? `text-xs font-medium transition-colors hover:opacity-80 rounded-full ${pkgBgColor} px-2 py-0.5`
				: `text-xs font-medium transition-colors hover:opacity-80 rounded-full ${pkgBgColor}`}
	>
		{#if transparent}
			<!-- <iconify-icon icon={statusIcon} width="16" class="opacity-80"></iconify-icon> -->
			<span class="text-black">Ver.</span>
			<span class="font-semibold">{pkg}</span>
		{:else}
			<!-- {#if !compact}
				<iconify-icon icon={statusIcon} class=""></iconify-icon>
			{/if} -->
			<span>
				{#if compact}
					v.{pkg}
				{:else}
					Ver. {pkg}
					{#if githubVersion !== pkg}
						{#if versionStatusMessage}
							— {versionStatusMessage}
						{:else}
							— Setup mode: version check will be available after installation
						{/if}
					{/if}
				{/if}
			</span>
		{/if}
	</a>
{/if}
