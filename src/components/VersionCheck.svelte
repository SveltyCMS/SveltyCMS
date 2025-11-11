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
-->
<script lang="ts">
	import { page } from '$app/state';
	import axios from 'axios';

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

	let { transparent = false, compact = false, onStatusChange, children }: VersionProps = $props();

	// --- State Management ---
	// Use the pkg version passed from the server load function
	const pkg = $derived(page.data?.settings?.PKG_VERSION || '0.0.0');
	let githubVersion = $state('');
	let pkgBgColor = $state('bg-surface-100 text-surface-900 dark:bg-surface-900 dark:text-surface-100'); // Default neutral color
	let versionStatusMessage = $state('Checking for updates...');
	let statusIcon = $state('mdi:loading');
	let isLoading = $state(true);

	// --- Logic ---
	$effect(() => {
		// Fetch package.json DIRECTLY TO AVOID API RATE LIMITS
		axios
			.get('https://raw.githubusercontent.com/SveltyCMS/SveltyCMS/main/package.json')
			.then((response) => {
				githubVersion = response.data.version;
				const [localMajor, localMinor, localPatch] = pkg.split('.').map(Number);
				const [githubMajor, githubMinor, githubPatch] = githubVersion.split('.').map(Number);
				if (githubMajor > localMajor) {
					pkgBgColor = 'bg-error-500 text-white';
					versionStatusMessage = `Major update to v${githubVersion} available!`;
					statusIcon = 'mdi:alert-circle';
				} else if (githubMinor > localMinor || (githubMinor === localMinor && githubPatch > localPatch)) {
					pkgBgColor = 'bg-warning-500 text-white';
					versionStatusMessage = `Update to v${githubVersion} recommended`;
					statusIcon = 'mdi:information';
				} else {
					pkgBgColor = 'bg-success-500 text-white';
					versionStatusMessage = 'You are up to date';
					statusIcon = 'mdi:check-circle';
				}
			})
			.catch(() => {
				githubVersion = pkg;
				pkgBgColor = 'bg-surface-100 text-surface-900 dark:bg-surface-900 dark:text-surface-100';
				versionStatusMessage = '';
				statusIcon = 'mdi:loading';
			})
			.finally(() => {
				isLoading = false;
				if (onStatusChange) {
					onStatusChange({ pkg, githubVersion, pkgBgColor, versionStatusMessage, statusIcon, isLoading });
				}
			});
	});

	// Transparent mode always uses neutral black/white styling
	const transparentColorClass = 'bg-surface-900/10 text-white';
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
		class:rounded-full={!transparent}
		class={transparent
			? `absolute bottom-5 left-1/2 flex -translate-x-1/2 transform items-center justify-center gap-2 rounded-full bg-gradient-to-r ${transparentColorClass} px-3 py-1 text-sm font-medium transition-opacity duration-300`
			: compact
				? `text-xs font-medium transition-colors hover:opacity-80 ${pkgBgColor} px-2 py-0.5`
				: `text-xs font-medium transition-colors hover:opacity-80 ${pkgBgColor}`}
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
							&mdash; {versionStatusMessage}
						{:else}
							&mdash; Setup mode: version check will be available after installation
						{/if}
					{/if}
				{/if}
			</span>
		{/if}
	</a>
{/if}
