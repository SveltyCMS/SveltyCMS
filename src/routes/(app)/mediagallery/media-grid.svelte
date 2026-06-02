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
  import TagEditorModal from "@src/components/media/tag-editor/tag-editor-modal.svelte";
  import SystemTooltip from "@src/components/system/system-tooltip.svelte";
  import type { MediaBase, MediaImage } from "@utils/media/media-models";
  import { formatBytes } from "@utils/utils";
  import type { SvelteSet } from "svelte/reactivity";
  import { scale } from "svelte/transition";

  interface Props {
    filteredFiles?: (MediaBase | MediaImage)[];
    gridSize?: "tiny" | "small" | "medium" | "large";
    isSelectionMode?: boolean;
    selectedFiles: SvelteSet<string>;
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
    ondeleteImage = () => {},
    onEditImage = () => {},
    onUpdateImage = () => {},
    onOpenFileDetails = () => {},
  }: Props = $props();

  let showTagModal = $state(false);
  let taggingFile = $state<MediaImage | null>(null);

  function formatMimeType(mime?: string): string {
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
  class="flex flex-wrap items-start gap-4 overflow-auto content-start p-1 min-h-100"
  role="grid"
  aria-label="Media asset grid"
>
  {#if filteredFiles.length === 0}
    <div
      class="flex flex-col items-center justify-center w-full min-h-75 border-2 border-dashed border-surface-300 dark:border-surface-700 rounded-2xl bg-surface-50/50 dark:bg-surface-800/20"
      transition:scale={{ duration: 200 }}
    >
      <iconify-icon icon="mdi:cloud-upload-outline" width="64" class=""
      ></iconify-icon>
      <h3 class="text-xl font-semibold">No media found</h3>
      <p
        class="text-sm text-surface-400 dark:text-surface-50 mb-6 text-center max-w-xs"
      >
        Drop files here or use the upload button to start building your library.
      </p>

      <label
        class="btn btn-lg preset-filled-tertiary-500 dark:preset-filled-primary-500 cursor-pointer shadow-lg hover:shadow-primary-500/20 transition-all"
      >
        <iconify-icon icon="mdi:plus" width="24"></iconify-icon>
        <span>Upload First File</span>
        <input
          type="file"
          multiple
          class="hidden"
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
      </label>
    </div>
  {:else}
    {#each filteredFiles as file (file._id || file.filename)}
      {const fileId = file._id?.toString() || file.filename}
      {const isSelected = selectedFiles.has(fileId)}

      <div
        class="group relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all duration-300
					hover:z-10 hover:-translate-y-1 hover:shadow-xl dark:bg-surface-900 focus-within:ring-4 focus-within:ring-primary-500
					{isSelected
          ? 'border-tertiary-500 dark:border-primary-500 ring-2 ring-primary-500/20'
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
          <div class="absolute left-3 top-3 z-20" in:scale={{ duration: 200 }}>
            <input
              type="checkbox"
              checked={isSelected}
              onchange={() => toggleSelection(file)}
              class="checkbox h-6 w-6 rounded-full border-2 border-surface-400 checked:bg-tertiary-500 dark:bg-primary-500 shadow-lg cursor-pointer"
              aria-label="Select {file.filename}"
            />
          </div>
        {/if}

        <!-- Actions overlay (visible on hover or focus) -->
        <div
          class="absolute right-2 top-2 z-30 flex flex-col gap-1 opacity-0 transition-all duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <SystemTooltip title="Edit" positioning={{ placement: "left" }}>
            <button
              onclick={(e) => {
                e.stopPropagation();
                onEditImage(file as MediaImage);
              }}
              class="btn-icon btn-icon-sm bg-white/90 dark:bg-surface-800/90 text-surface-600 dark:text-surface-300 shadow-md backdrop-blur-sm"
              aria-label="Edit {file.filename}"
            >
              <iconify-icon icon="mdi:pencil" width={16}></iconify-icon>
            </button>
          </SystemTooltip>

          <button
            onclick={(e) => {
              e.stopPropagation();
              ondeleteImage(file);
            }}
            class="btn-icon btn-icon-sm bg-white/90 dark:bg-surface-800/90 text-error-500 shadow-md backdrop-blur-sm"
            aria-label="Delete {file.filename}"
          >
            <iconify-icon icon="mdi:trash-can-outline" width={16}
            ></iconify-icon>
          </button>
        </div>

        <!-- Image / Icon -->
        <button
          class="relative aspect-square w-full overflow-hidden bg-surface-100 dark:bg-surface-800 text-left"
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
            class="absolute bottom-0 left-0 right-0 h-1/2 bg-linear-to-t from-black/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
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
