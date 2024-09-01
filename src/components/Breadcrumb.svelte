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
		<li class="crumb flex items-center">
			<button
				class="anchor flex items-center gap-1 rounded px-2 py-1 text-gray-800 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700"
				on:click={() =>
					index === 0
						? openFolder(null)
						: openFolder(folders.find((f) => f.path.join('/') === breadcrumb.slice(1, index + 1).join('/'))?._id || null)}
			>
				{#if index === 0}
					<iconify-icon icon="mdi:home" width="18" class="text-gray-600 dark:text-gray-400" />
					<span class="ml-1">{crumb}</span>
				{:else}
					<iconify-icon icon="mdi:folder" width="18" class="text-gray-600 dark:text-gray-400" />
					<span class="ml-1">{crumb}</span>
				{/if}
			</button>
		</li>
		{#if index < breadcrumb.length - 1}
			<li class="crumb-separator mx-2 text-gray-500 dark:text-gray-400" aria-hidden="true">&rsaquo;</li>
		{/if}
	{/each}
</ol>
