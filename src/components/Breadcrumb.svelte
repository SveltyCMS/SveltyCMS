<!--
@file src/components/breadcrumb.svelte
@component 
**Enhanced Breadcrumb - Svelte 5 Optimized**

Accessible breadcrumb navigation with icons, keyboard support, and visual feedback.

@example
<Breadcrumb {breadcrumb} {openFolder} {folders} />

### Props
- `breadcrumb` (string[]): Array of breadcrumb labels
- `openFolder` (function): Callback to open folder by ID
- `folders` (Folder[]): Array of folder objects

### Features
- Full keyboard navigation
- ARIA-compliant accessibility
- Visual current page indicator
- Home and folder icons
- Truncation for long paths
- Hover states and focus indicators
- Copy path to clipboard
-->

<script lang="ts">
	interface Folder {
		_id: string;
		name: string;
		path: string[];
	}

	interface Props {
		breadcrumb: string[];
		folders: Folder[];
		maxVisible?: number;
		openFolder: (folderId: string | null) => void;
	}

	const { breadcrumb, openFolder, folders, maxVisible = 5 }: Props = $props();

	// State
	let showAll = $state(false);

	// Determine if breadcrumb needs truncation
	const needsTruncation = $derived(breadcrumb.length > maxVisible && !showAll);

	// Visible breadcrumb items
	const visibleBreadcrumb = $derived(() => {
		if (!needsTruncation || showAll) {
			return breadcrumb;
		}

		// Show first, ellipsis, and last two items
		return [breadcrumb[0], '...', ...breadcrumb.slice(-2)];
	});

	// Get visible indices (maps visible items to original indices)
	const visibleIndices = $derived(() => {
		if (!needsTruncation || showAll) {
			return breadcrumb.map((_, i) => i);
		}

		return [
			0,
			-1, // Ellipsis
			breadcrumb.length - 2,
			breadcrumb.length - 1
		];
	});

	// Handle breadcrumb click
	function handleBreadcrumbClick(visibleIndex: number) {
		const actualIndex = visibleIndices()[visibleIndex];

		// Skip ellipsis clicks
		if (actualIndex === -1) {
			showAll = true;
			return;
		}

		if (actualIndex === 0) {
			// Click on home/root
			openFolder(null);
		} else {
			// Find the folder matching the breadcrumb
			const folder = folders[actualIndex];
			openFolder(folder ? folder._id : null);
		}
	}

	// Copy path to clipboard
	async function copyPath() {
		const path = breadcrumb.join(' > ');
		try {
			await navigator.clipboard.writeText(path);
			// Could show a toast notification here
		} catch (err) {
			console.error('Failed to copy path:', err);
		}
	}

	// Handle keyboard navigation
	function handleKeydown(event: KeyboardEvent, index: number) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleBreadcrumbClick(index);
		}
	}
</script>

<nav aria-label="Breadcrumb navigation" class="flex items-center gap-2">
	<!-- Breadcrumb list -->
	<ol class="flex flex-wrap items-center gap-1 text-sm text-gray-700 dark:text-gray-300" role="list">
		{#each visibleBreadcrumb() as crumb, visibleIndex (visibleIndex)}
			{@const actualIndex = visibleIndices()[visibleIndex]}
			{@const isLast = visibleIndex === visibleBreadcrumb().length - 1}
			{@const isEllipsis = actualIndex === -1}

			<li class="flex items-center" role="listitem">
				{#if isEllipsis}
					<!-- Ellipsis button to expand -->
					<button
						onclick={() => (showAll = true)}
						class="flex items-center gap-1 rounded px-2 py-1 text-sm transition-colors hover:bg-surface-100 focus:bg-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:hover:bg-surface-800 dark:focus:bg-surface-800"
						aria-label="Show all breadcrumb items"
						type="button"
					>
						<iconify-icon icon="mdi:dots-horizontal" width="18" class="text-surface-500" aria-hidden="true"></iconify-icon>
					</button>
				{:else}
					<!-- Regular breadcrumb item -->
					<button
						onclick={() => handleBreadcrumbClick(visibleIndex)}
						onkeydown={(e) => handleKeydown(e, visibleIndex)}
						class="flex items-center gap-1.5 rounded px-2 py-1 text-sm transition-all {isLast
							? 'font-semibold text-tertiary-500 dark:text-primary-400'
							: 'hover:bg-surface-100 hover:text-primary-500 focus:bg-surface-100 focus:text-primary-500 dark:hover:bg-surface-800 dark:focus:bg-surface-800'} focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
						aria-current={isLast ? 'page' : undefined}
						type="button"
						title={crumb}
					>
						{#if actualIndex === 0}
							<!-- Home icon -->
							<iconify-icon icon="mdi:home" width="18" class="shrink-0 text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
							<span class="max-w-[150px] truncate">{crumb}</span>
						{:else}
							<!-- Folder icon -->
							<iconify-icon icon="mdi:folder" width="18" class="shrink-0 text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
							<span class="max-w-[150px] truncate">{crumb}</span>
						{/if}
					</button>
				{/if}

				<!-- Separator (not after last item) -->
				{#if !isLast}
					<span class="mx-1 text-gray-400 dark:text-gray-600" aria-hidden="true">
						<iconify-icon icon="mdi:chevron-right" width="16"></iconify-icon>
					</span>
				{/if}
			</li>
		{/each}
	</ol>

	<!-- Copy path button -->
	<button
		onclick={copyPath}
		class="btn-icon btn-icon-sm preset-outlined-surface-500 ml-auto"
		title="Copy path to clipboard"
		aria-label="Copy current path to clipboard"
		type="button"
	>
		<iconify-icon icon="mdi:content-copy" width="16"></iconify-icon>
	</button>

	<!-- Screen reader announcement -->
	<div class="sr-only" role="status" aria-live="polite">Current location: {breadcrumb.join(', then ')}</div>
</nav>
