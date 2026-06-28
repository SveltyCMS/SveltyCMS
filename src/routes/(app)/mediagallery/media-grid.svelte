<!--
@file src/routes/(app)/mediagallery/MediaGrid.svelte
@component
**Grid view component for the media gallery**
Features:
- Keyboard navigation (Enter/Space to select)
- Multi-select integration
- High-contrast focus states
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
  import TagEditorModal from "@src/components/media/tag-editor/tag-editor-modal.svelte";
  import SystemTooltip from "@src/components/system/system-tooltip.svelte";
  import type { MediaBase, MediaImage } from "@utils/media/media-models";
  import { formatBytes } from "@utils/utils";
  import { SvelteSet } from "svelte/reactivity";
  import { scale } from "svelte/transition";

  interface Props {
    filteredFiles?: (MediaBase | MediaImage)[];
    gridSize?: "tiny" | "small" | "medium" | "large";
    isSelectionMode?: boolean;
    selectedFiles: SvelteSet<string>;
    publishedMediaIds?: SvelteSet<string>;
    ondeleteImage?: (file: MediaBase | MediaImage) => void;
    onEditImage?: (file: MediaImage) => void;
    onUpdateImage?: (file: MediaImage) => void;
    onOpenFileDetails?: (file: MediaBase | MediaImage) => void;
  }

  let {
    filteredFiles = $bindable([]),
    gridSize = "medium",
    isSelectionMode = false,
    selectedFiles = $bindable(),
    publishedMediaIds = $bindable(new SvelteSet<string>()),
    ondeleteImage = () => {},
    onEditImage = () => {},
    onUpdateImage = () => {},
    onOpenFileDetails = () => {},
  }: Props = $props();

  	let showTagModal = $state(false);
  	let taggingFile = $state<MediaImage | null>(null);
  	let fileUploadInput = $state<HTMLInputElement>();

  function formatMimeType(mime: string | undefined = undefined): string {
    if (!mime) return "Unknown";
    const parts = mime.split("/");
    return parts[1] ? parts[1].toUpperCase() : parts[0].toUpperCase();
  }

  function getFileIcon(file: MediaBase): string {
    const fileName = file.filename || "";
    const fileExt = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
    switch (true) {
      case file.type === "image":
        return "fa-solid:image";
      case file.type === "video":
        return "fa-solid:video";
      case file.type === "audio":
        return "fa-solid:play-circle";
      case fileExt === ".pdf":
        return "vscode-icons:file-type-pdf2";
      default:
        return "vscode-icons:file";
    }
  }

  function toggleSelection(file: MediaBase | MediaImage) {
    const fileId = file._id?.toString() || file.filename;
    if (selectedFiles.has(fileId)) {
      selectedFiles.delete(fileId);
    } else {
      selectedFiles.add(fileId);
    }
  }

  function handleItemClick(file: MediaBase | MediaImage) {
    if (isSelectionMode) {
      toggleSelection(file);
    } else {
      onOpenFileDetails(file);
    }
  }

  function handleKeyDown(e: KeyboardEvent, file: MediaBase | MediaImage) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (isSelectionMode) {
        toggleSelection(file);
      } else {
        onOpenFileDetails(file);
      }
    }
  }
</script>

<div
  class="flex min-h-100 flex-wrap content-start items-start gap-4 overflow-auto"
  role="grid"
  aria-label="Media asset grid"
  data-testid="media-grid"
>
  {#if filteredFiles.length === 0}
    <div
      class="flex flex-col items-center justify-center w-full min-h-75 border-2 border-dashed border-surface-300 dark:border-surface-700 rounded bg-surface-50 dark:bg-surface-800"
      transition:scale={{ duration: 200 }}
      data-testid="media-grid-empty"
    >
      <iconify-icon icon="mdi:cloud-upload-outline" width="64" class=""
      ></iconify-icon>
      <h3 class="text-xl font-semibold">No media found</h3>
      <p
        class="text-sm text-surface-400 dark:text-surface-50 mb-6 text-center max-w-xs"
      >
        Drop files here or use the upload button to start building your library.
      </p>

      		<Button variant="tertiary" size="lg" onclick={() => fileUploadInput?.click()} class="shadow-lg hover:shadow-primary-500/20 transition-all">
      			<iconify-icon icon="mdi:plus" width="24"></iconify-icon>
      			<span>Upload First File</span>
      		</Button>
      		<input
      			type="file"
      			multiple
      			class="hidden"
      			bind:this={fileUploadInput}
      			onchange={(e) => {
      				const input = e.target as HTMLInputElement;
      				if (input.files?.length) {
      					const event = new CustomEvent("externalUpload", {
      						detail: { files: input.files },
      					});
      					document.dispatchEvent(event);
      				}
      			}}
      			accept="image/*,video/*,audio/*,application/pdf"
      		/>
    </div>
  {:else}
    {#each filteredFiles as file (file._id || file.filename)}
      {const fileId = file._id?.toString() || file.filename}
      {const isSelected = selectedFiles.has(fileId)}
      {const isPublishedReferenced = publishedMediaIds.has(fileId)}

      <div
        class="group relative flex flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition-all duration-300
					hover:z-10 hover:-translate-y-1 hover:shadow-xl dark:bg-surface-900 focus-within:ring-4 focus-within:ring-primary-500
					{isSelected
          ? 'border-primary-500 ring-2 ring-primary-500/20'
          : 'border-surface-200 dark:border-surface-800'}
					{gridSize === 'tiny'
          ? 'w-32'
          : gridSize === 'small'
            ? 'w-48'
            : gridSize === 'medium'
              ? 'w-64'
              : 'w-80'}"
        role="gridcell"
        aria-selected={isSelected}
      >
        <!-- Selection UI -->
        {#if isSelectionMode || isSelected}
          <div class="absolute inset-s-3 top-3 z-20" in:scale={{ duration: 200 }}>
            <input
              type="checkbox"
              checked={isSelected}
              onchange={() => toggleSelection(file)}
              class="checkbox h-6 w-6 cursor-pointer rounded-full border-2 border-surface-400 shadow-lg checked:bg-primary-500"
              aria-label="Select {file.filename}"
            />
          </div>
        {/if}

        <!-- Actions overlay (visible on hover or focus) -->
        <div
          class="absolute inset-e-2 top-2 z-30 flex flex-col gap-1 opacity-0 transition-all duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <SystemTooltip
            title={isPublishedReferenced ? "Referenced by published content" : "Edit"}
            positioning={{ placement: "start" }}
          >
            <Button variant="ghost"
              disabled={isPublishedReferenced}
              data-testid="media-edit-button"
              onclick={(e: MouseEvent) => {
                e.stopPropagation();
                onEditImage(file as MediaImage);
              }}
              aria-label="Edit {file.filename}"
             class="p-0! min-w-0 bg-white/90 dark:bg-surface-800/90 text-surface-600 dark:text-surface-300 shadow-md backdrop-blur-sm">
              <iconify-icon icon="mdi:pencil" width={16}></iconify-icon>
            </Button>
          </SystemTooltip>

          <SystemTooltip
            title={isPublishedReferenced ? "Referenced by published content" : "Delete"}
            positioning={{ placement: "start" }}
          >
            <Button variant="ghost"
              disabled={isPublishedReferenced}
              onclick={(e: MouseEvent) => {
                e.stopPropagation();
                ondeleteImage(file);
              }}
              aria-label="Delete {file.filename}"
             class="p-0! min-w-0 bg-white/90 dark:bg-surface-800/90 text-error-500 shadow-md backdrop-blur-sm">
              <iconify-icon icon="mdi:trash-can-outline" width={16}
              ></iconify-icon>
            </Button>
          </SystemTooltip>
        </div>

        <!-- Published reference badge -->
        {#if isPublishedReferenced}
          <div class="absolute inset-s-2 top-2 z-20" title="Referenced by published content">
            <span class="flex items-center gap-1 rounded-full bg-warning-500/20 px-2 py-0.5 text-[10px] font-medium text-warning-700 backdrop-blur-sm dark:text-warning-300">
              <iconify-icon icon="mdi:lock-outline" width={12}></iconify-icon>
              Published
            </span>
          </div>
        {/if}

        <!-- Image / Icon -->
        <button
          class="relative aspect-square w-full overflow-hidden bg-surface-100 dark:bg-surface-800 text-start"
          onclick={() => handleItemClick(file)}
          onkeydown={(e) => handleKeyDown(e, file)}
          aria-label="Preview {file.filename}"
        >
          {#if file.type === "image"}
            <div
              class="h-full w-full bg-surface-100 dark:bg-surface-800 transition-colors duration-500"
              style:background-color={(file.metadata?.dominantColor as string) || 'transparent'}
            >
              <!-- ⚡ Progressive Loading: Placeholder -->
              {#if file.metadata?.placeholder}
                <img
                  src={file.metadata.placeholder as string}
                  alt=""
                  class="absolute inset-0 h-full w-full object-cover blur-xl scale-110 opacity-50"
                  aria-hidden="true"
                />
              {/if}

              <img
                src={file.url}
                alt={file.filename}
                class="relative h-full w-full object-cover transition-all duration-500 group-hover:scale-110"
                style:object-position={file.metadata?.focalPoint
                  ? `${file.metadata.focalPoint.x}% ${file.metadata.focalPoint.y}%`
                  : "center"}
                loading="lazy"
                onload={(e) => (e.currentTarget as HTMLElement).classList.add('opacity-100')}
              />
            </div>
          {:else}
            <div
              class="flex h-full w-full items-center justify-center text-surface-300 dark:text-surface-600"
            >
              <iconify-icon icon={getFileIcon(file)} width={64}></iconify-icon>
            </div>
          {/if}

          <div
            class="absolute bottom-0 inset-s-0 inset-e-0 h-1/2 bg-linear-to-t from-black/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          ></div>
        </button>

        <!-- Meta -->
        <div
          class="p-3 border-t border-surface-100 dark:border-surface-800 bg-white dark:bg-surface-900"
        >
          <div class="truncate text-xs font-semibold" title={file.filename}>
            {file.filename}
          </div>
          <div
            class="flex items-center gap-2 mt-1 text-[10px] opacity-60 font-mono"
          >
            <span class="rounded bg-surface-100 px-1 dark:bg-surface-800"
              >{formatMimeType(file.mimeType)}</span
            >
            <span>{formatBytes(file.size)}</span>
          </div>
        </div>
      </div>
    {/each}
  {/if}
</div>

<TagEditorModal
  bind:show={showTagModal}
  bind:file={taggingFile}
  onUpdate={onUpdateImage}
/>
