<!--
@file src/components/Breadcrumb.svelte
@component 
**Breadcrumb component for navigating through folder hierarchies**

Features:
- Dynamic breadcrumb rendering based on the current path
- Custom folder opening functionality
- Home and folder icons for visual clarity

Usage
<Breadcrumb {breadcrumb} {openFolder} {folders} />

-->

<script lang="ts">
	// Define types for better TypeScript support
	type Folder = {
		_id: string;
		name: string;
		path: string[];
	};

	interface Props {
		// Define props with proper typing
		breadcrumb: string[];
		openFolder: (folderId: string | null) => void;
		folders: Folder[];
	}

	let { breadcrumb, openFolder, folders }: Props = $props();

	// Function to handle breadcrumb item click
	function handleBreadcrumbClick(index: number) {
		if (index === 0) {
			// Click on home/root
			openFolder(null);
		} else {
			// Find the folder matching the current breadcrumb path
			const pathUpToThisPoint = breadcrumb.slice(1, index + 1).join('/');
			const folder = folders.find((f) => f.path.join('/') === pathUpToThisPoint);
			openFolder(folder ? folder._id : null);
		}
	}
</script>

<nav aria-label="Breadcrumb" class="mt-1">
	<ol class="flex items-center text-sm text-gray-700 dark:text-gray-300">
		{#each breadcrumb as crumb, index}
			<li class="flex items-center">
				<button
					class="btn-sm flex items-center text-xs hover:underline focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
					onclick={() => handleBreadcrumbClick(index)}
					aria-current={index === breadcrumb.length - 1 ? 'page' : undefined}
				>
					{#if index === 0}
						<iconify-icon icon="mdi:home" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span class="ml-1">{crumb}</span>
					{:else}
						<iconify-icon icon="mdi:folder" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span class="ml-1">{crumb}</span>
					{/if}
				</button>
				{#if index < breadcrumb.length - 1}
					<span class="mx-2 text-gray-500 dark:text-gray-400" aria-hidden="true">&rsaquo;</span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
