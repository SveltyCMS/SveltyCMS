<!--
@file src/routes/(app)/mediagallery/MediaTable.svelte
@component
**Table view component for the media gallery. Displays media items in a responsive table layout with sortable columns**

```tsx
<MediaTable filteredFiles={filteredFiles} tableSize="small" />
```
#### Props
- `filteredFiles: MediaBase[]`: An array of media items to be displayed in the table view.
- `tableSize: 'small' | 'medium' | 'large'`: The size of the table layout to be used.
- `ondeleteImage?: (file: MediaBase) => void`: An optional callback function to handle image deletion.
- `onSelectionChange?: (selectedFiles: MediaBase[]) => void`: An optional callback function to handle selection changes.
- `onUpdateImage?: (file: MediaImage) => void`: Callback for updating image data.

Key features:
- Responsive table layout for media items
- Sortable columns for name, size, type, and date
- Thumbnail preview for images
- Uses formatBytes for human-readable file sizes
- Implements constructMediaUrl for proper URL handling
- Pagination support (if implemented in parent component)
- Selection support with callback function
- Tag management via TagEditorModal
-->

<script lang="ts">
	// Utils
	import type { MediaBase, MediaImage, MediaTypeEnum } from '@utils/media/mediaModels';
	import { logger } from '@utils/logger';
	import { formatBytes } from '@utils/utils';
	// Components
	import TableFilter from '@components/system/table/TableFilter.svelte';
	import TableIcons from '@components/system/table/TableIcons.svelte';
	import TablePagination from '@components/system/table/TablePagination.svelte';
	import TagEditorModal from '@components/media/tagEditor/TagEditorModal.svelte';
	import { Tooltip, Portal } from '@skeletonlabs/skeleton-svelte';

	interface Props {
		filteredFiles?: (MediaBase | MediaImage)[];
		tableSize?: 'tiny' | 'small' | 'medium' | 'large';
		ondeleteImage?: (file: MediaBase | MediaImage) => void;
		onSelectionChange?: (selectedFiles: (MediaBase | MediaImage)[]) => void;
		onUpdateImage?: (file: MediaImage) => void;
		onEditImage?: (file: MediaImage) => void;
		onDeleteFiles?: (files: (MediaBase | MediaImage)[]) => void;
	}

	interface SortableMedia extends MediaBase {
		filename: string;
		size: number;
		type: MediaTypeEnum;
	}

	let {
		filteredFiles = $bindable([]),
		tableSize = 'medium',
		ondeleteImage = () => {},
		onSelectionChange = () => {},
		onUpdateImage = () => {},
		onEditImage = () => {},
		onDeleteFiles = () => {}
	}: Props = $props();

	// Filter state
	let globalSearchValue = $state('');
	let filterShow = $state(false);
	let columnShow = $state(false);
	let density = $state('normal');

	// Selection state
	const selectedFiles = $state<Set<string>>(new Set());

	// Tag Modal State
	let showTagModal = $state(false);
	let taggingFile = $state<MediaImage | null>(null);

	function openTagEditor(file: MediaImage) {
		taggingFile = file;
		showTagModal = true;
	}

	function handleSelection(file: MediaBase | MediaImage, checked: boolean) {
		if (checked) {
			selectedFiles.add(file.filename);
		} else {
			selectedFiles.delete(file.filename);
		}
		onSelectionChange(filteredFiles.filter((f) => selectedFiles.has(f.filename)));
	}

	// Pagination state
	let currentPage = $state(1);
	let rowsPerPage = $state(10);
	const pagesCount = $derived(Math.ceil(filteredFiles.length / rowsPerPage));
	const paginatedFiles = $derived(filteredFiles.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage));

	function handleDelete(file: MediaBase | MediaImage) {
		ondeleteImage(file);
	}

	// Sorting functionality
	let sortColumn = $state('name');
	let sortOrder = $state(1); // 1 for ascending, -1 for descending

	function sort(column: keyof Pick<SortableMedia, 'filename' | 'size' | 'type'>) {
		if (sortColumn === column) {
			sortOrder *= -1;
		} else {
			sortColumn = column;
			sortOrder = 1;
		}

		filteredFiles = filteredFiles.sort((a, b) => {
			if (column === 'size') {
				return ((a[column] ?? 0) - (b[column] ?? 0)) * sortOrder;
			} else {
				return String(a[column as keyof SortableMedia]).localeCompare(String(b[column as keyof SortableMedia])) * sortOrder;
			}
		});
	}

	function getThumbnails(file: MediaBase | MediaImage) {
		return 'thumbnails' in file ? file.thumbnails || {} : {};
	}

	function getThumbnail(file: MediaBase | MediaImage, size: string) {
		const thumbnails = getThumbnails(file);
		// Map UI table sizes to DB keys
		const sizeMap: Record<string, string> = {
			tiny: 'thumbnail', // or 'xs'
			small: 'sm',
			medium: 'md',
			large: 'lg'
		};
		const key = sizeMap[size] || size;
		return thumbnails ? thumbnails[key as keyof typeof thumbnails] : undefined;
	}

	function getImageUrl(file: MediaBase | MediaImage, size: string) {
		const thumbnail = getThumbnail(file, size);
		return thumbnail?.url || (file as any).url;
	}
</script>

<div class="block w-full overflow-hidden">
	{#if filteredFiles.length === 0}
		<div class="mx-auto text-center text-tertiary-500 dark:text-primary-500">
			<iconify-icon icon="bi:exclamation-circle-fill" height="44" class="mb-2"></iconify-icon>
			<p class="text-lg">No media found</p>
		</div>
	{:else}
		<!-- Header with Filter -->
		<div class="mb-4 flex items-center justify-between">
			<div class="flex items-center gap-2">
				<h2 class="text-lg font-bold">Media Files</h2>
				{#if selectedFiles.size > 0}
					<button
						class="variant-filled-error btn btn-sm ml-4"
						onclick={() => {
							const filesToDelete = filteredFiles.filter((f) => selectedFiles.has(f.filename));
							onDeleteFiles(filesToDelete);
							selectedFiles.clear();
						}}
					>
						<iconify-icon icon="mdi:trash-can-outline"></iconify-icon>
						<span>Delete ({selectedFiles.size})</span>
					</button>
				{/if}
			</div>

			<!-- TODO: move to +page.svelte -->
			<div class="flex items-center gap-2">
				<TableFilter bind:globalSearchValue bind:filterShow bind:columnShow bind:density />
			</div>
		</div>

		<div class="table-container max-h-[calc(100vh-120px)] overflow-auto">
			<table class="table table-interactive table-hover">
				<thead class="bg-surface-100-800-token sticky top-0 text-tertiary-500 dark:text-primary-500">
					<tr class="divide-x divide-surface-400 border-b border-black dark:border-white text-tertiary-500 dark:text-primary-500">
						<th class="w-10">Select</th>
						<th>Thumbnail</th>
						<!-- Name -->
						<th onclick={() => sort('filename')}>
							Name {sortColumn === 'filename' ? (sortOrder === 1 ? '▲' : '▼') : ''}
						</th>
						<!-- Size -->
						<th onclick={() => sort('size')}>
							Size {sortColumn === 'size' ? (sortOrder === 1 ? '▲' : '▼') : ''}
						</th>
						<!-- Type -->
						<th onclick={() => sort('type')}>
							Type {sortColumn === 'type' ? (sortOrder === 1 ? '▲' : '▼') : ''}
						</th>
						<!-- Path -->
						<th>Path</th>
						<!-- Tags (Moved Here) -->
						<th>Tags</th>
						<!-- Actions -->
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each paginatedFiles as file (file._id)}
						<tr class="divide-x divide-surface-400 border-b border-black dark:border-white">
							<TableIcons
								cellClass="w-10 text-center"
								checked={selectedFiles.has(file.filename)}
								onCheck={(checked: boolean) => handleSelection(file, checked)}
							/>
							<td>
								{#if file?.filename && file?.path && file?.hash}
									<img
										src={getImageUrl(file, tableSize) ?? '/Default_User.svg'}
										alt={`Thumbnail for ${file.filename}`}
										class={`object-cover ${tableSize === 'tiny' ? 'h-10 w-10' : tableSize === 'small' ? 'h-16 w-16' : tableSize === 'medium' ? 'h-24 w-24' : 'h-32 w-32'}`}
										onerror={(e: Event) => {
											const target = e.target as HTMLImageElement;
											if (target) {
												logger.error('Failed to load media thumbnail for file:', file.filename);
												target.src = '/Default_User.svg';
												target.alt = 'Fallback thumbnail image';
											}
										}}
										loading="lazy"
										decoding="async"
									/>
								{:else}
									<div
										class="flex h-full w-full items-center justify-center bg-surface-200 dark:bg-surface-700"
										aria-label="Missing thumbnail"
										role="img"
									>
										<iconify-icon icon="bi:exclamation-triangle-fill" height="24" class="text-warning-500" aria-hidden="true"></iconify-icon>
									</div>
								{/if}
							</td>
							<td title={file.filename}>{file.filename}</td>
							<td>
								{#if file.size}
									{formatBytes(file.size)}
								{:else}
									Size unknown
								{/if}
							</td>
							<td>{file.type || 'Unknown'}</td>
							<td>{file.path}</td>
							<!-- Tags Column (Moved Here) -->
							<td>
								<div class="flex flex-wrap gap-1">
									{#if 'metadata' in file && (file.metadata?.tags?.length || file.metadata?.aiTags?.length)}
										{@const tags = file.metadata.tags || []}
										{@const aiTags = file.metadata.aiTags || []}
										{@const allTagsCount = tags.length + aiTags.length}

										{#if tags.length > 0}
											<span class="badge variant-filled-surface text-[10px]">{tags[0]}</span>
										{:else if aiTags.length > 0}
											<span class="badge variant-filled-secondary text-[10px]">{aiTags[0]}</span>
										{/if}

										{#if allTagsCount > 1}
											<span class="badge variant-soft text-[10px]">+{allTagsCount - 1}</span>
										{/if}
									{/if}
									<!-- Toggle Tags Tooltip -->
									<Tooltip positioning={{ placement: 'top' }}>
										<Tooltip.Trigger>
											<button
												class="btn-icon btn-icon-sm variant-soft-primary"
												onclick={() => openTagEditor(file as MediaImage)}
												aria-label="Manage Tags"
											>
												<iconify-icon icon="mdi:tag-edit"></iconify-icon>
											</button>
										</Tooltip.Trigger>
										<Portal>
											<Tooltip.Positioner>
												<Tooltip.Content class="rounded bg-surface-900 px-2 py-1 text-xs text-white shadow-xl dark:bg-surface-100 dark:text-black">
													Manage Tags
													<Tooltip.Arrow class="fill-surface-900 dark:fill-surface-100" />
												</Tooltip.Content>
											</Tooltip.Positioner>
										</Portal>
									</Tooltip>
								</div>
							</td>
							<!-- Actions -->
							<td>
								<button class="preset-outlined-primary-500 btn-sm" aria-label="Edit" onclick={() => onEditImage(file as MediaImage)}>Edit</button>
								<button onclick={() => handleDelete(file)} class="preset-filled-error-500 btn-sm" aria-label="Delete"> Delete </button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>

			<!-- Pagination -->
			<div
				class=" bg-surface-100-800-token sticky bottom-0 left-0 right-0 mt-2 flex flex-col items-center justify-center px-2 py-2 md:flex-row md:justify-between md:p-4"
			>
				<TablePagination
					bind:currentPage
					bind:rowsPerPage
					{pagesCount}
					totalItems={filteredFiles.length}
					rowsPerPageOptions={[5, 10, 25, 50, 100]}
					onUpdatePage={(page: number) => {
						currentPage = page;
					}}
					onUpdateRowsPerPage={(rows: number) => {
						rowsPerPage = rows;
						currentPage = 1;
					}}
				/>
			</div>
		</div>
	{/if}

	<!-- Tag Editor Modal -->
	<TagEditorModal bind:show={showTagModal} bind:file={taggingFile} onUpdate={onUpdateImage} />
</div>
