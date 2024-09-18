<!--
@files src/components/Breadcrumb.svelte
@description Breadcrumb component
-->

<script lang="ts">
	export let breadcrumb: string[];
	export let openFolder: (folderId: string | null) => void;
	export let folders: { _id: string; name: string; path: string[] }[];
</script>

<ol class="breadcrumb mt-1 flex items-center text-sm text-gray-700 dark:text-gray-300">
	{#each breadcrumb as crumb, index}
		<li class="flex items-center">
			<button
				class="btn-sm flex items-center text-xs underline"
				on:click={() => {
					if (index === 0) {
						openFolder(null); // Root folder
					} else {
						// Find the folder matching the current breadcrumb path
						const pathUpToThisPoint = breadcrumb.slice(1, index + 1).join('/');
						const folder = folders.find((f) => f.path.join('/') === pathUpToThisPoint);
						openFolder(folder ? folder._id : null);
					}
				}}
			>
				{#if index === 0}
					<iconify-icon icon="mdi:home" width="18" class="text-tertiary-500 dark:text-primary-500" />
					<span class="ml-1">{crumb}</span>
				{:else}
					<iconify-icon icon="mdi:folder" width="18" class="text-tertiary-500 dark:text-primary-500" />
					<span class="ml-1">{crumb}</span>
				{/if}
			</button>
		</li>
		{#if index < breadcrumb.length - 1}
			<li class="mx-2 text-gray-500 dark:text-gray-400" aria-hidden="true">&rsaquo;</li>
		{/if}
	{/each}
</ol>
