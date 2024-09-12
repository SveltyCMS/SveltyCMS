<!-- 
@file src/components/VirtualFolder.svelte
@description VirtualFolder component 
-->

<script lang="ts">
	import { getToastStore, getModalStore } from '@skeletonlabs/skeleton';
	import { publicEnv } from '@root/config/public';

	export let folders = [];
	export let currentFolder = null;

	// Event handlers
	export let onCreateFolder = (name: string) => {};
	export let onDeleteFolder = (folderId: string) => {};
	export let onUpdateFolder = (folderId: string, newName: string, newParentId?: string) => {};
	export let onOpenFolder = (folderId: string | null) => {};

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// Open add virtual folder modal
	function openAddFolderModal() {
		let currentFolderPath = publicEnv.MEDIA_FOLDER;

		if (currentFolder) {
			currentFolderPath = currentFolder.path.join('/');
		}

		const modal = {
			type: 'prompt',
			title: 'Add Folder',
			body: `Creating subfolder in: <span class="text-tertiary-500 dark:text-primary-500">${currentFolderPath}</span>`,
			response: (r: string) => {
				if (r) onCreateFolder(r);
			}
		};

		modalStore.trigger(modal);
	}
</script>

<!-- Folder Management Section -->
<div class="mb-4 flex flex-col space-y-2">
	<button class="variant-filled-tertiary btn gap-2" on:click={openAddFolderModal}>
		<iconify-icon icon="mdi:folder-add-outline" width="24" />
		Add Folder
	</button>

	{#if folders.length > 0}
		<!-- Root Level Folders -->
		{#each folders.filter((f) => !currentFolder || f.parent === currentFolder._id) as folder (folder._id)}
			<div class="relative flex flex-col space-y-2">
				<!-- Folder Button -->
				<button
					on:click={() => onOpenFolder(folder._id)}
					class="flex items-center space-x-2 rounded-lg border p-4 transition hover:bg-gray-200 dark:hover:bg-gray-700"
				>
					<iconify-icon icon="mdi:folder" width="28" class="text-yellow-500" />
					<span class="flex-1 overflow-hidden text-ellipsis text-left text-sm font-medium">{folder.name}</span>
				</button>

				<!-- Action Buttons -->
				<div class="absolute right-2 top-2 flex gap-2">
					<button
						on:click={(e) => {
							e.stopPropagation();
							onUpdateFolder(folder._id, 'New Folder Name');
						}}
						class="text-blue-500 hover:text-blue-700"
					>
						<iconify-icon icon="mdi:pencil" width="20" />
					</button>
					<button
						on:click={(e) => {
							e.stopPropagation();
							onDeleteFolder(folder._id);
						}}
						class="text-red-500 hover:text-red-700"
					>
						<iconify-icon icon="mdi:delete" width="20" />
					</button>
				</div>

				<!-- Subfolders (Indented) -->
				<div class="pl-8">
					{#each folders.filter((sub) => sub.parent === folder._id) as subfolder (subfolder._id)}
						<div class="relative flex flex-col space-y-2">
							<!-- Subfolder Button -->
							<button
								on:click={() => onOpenFolder(subfolder._id)}
								class="flex items-center space-x-2 rounded-lg border p-4 transition hover:bg-gray-200 dark:hover:bg-gray-700"
							>
								<iconify-icon icon="mdi:folder" width="28" class="text-yellow-500" />
								<span class="flex-1 overflow-hidden text-ellipsis text-left text-sm font-medium">{subfolder.name}</span>
							</button>

							<!-- Subfolder Action Buttons -->
							<div class="absolute right-2 top-2 flex gap-2">
								<button
									on:click={(e) => {
										e.stopPropagation();
										onUpdateFolder(subfolder._id, 'New Folder Name');
									}}
									class="text-blue-500 hover:text-blue-700"
								>
									<iconify-icon icon="mdi:pencil" width="20" />
								</button>
								<button
									on:click={(e) => {
										e.stopPropagation();
										onDeleteFolder(subfolder._id);
									}}
									class="text-red-500 hover:text-red-700"
								>
									<iconify-icon icon="mdi:delete" width="20" />
								</button>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/each}
	{:else}
		<!-- No Folders Found Message -->
		<div class="py-10 text-center">
			<p class="text-lg text-gray-600 dark:text-gray-300">No folders found.</p>
		</div>
	{/if}
</div>
