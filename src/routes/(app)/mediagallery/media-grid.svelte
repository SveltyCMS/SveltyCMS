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
	import Checkbox from '@components/ui/checkbox.svelte';
  import TagEditorModal from "@src/components/media/tag-editor/tag-editor-modal.svelte";
  import MediaGridActionTooltip from "./media-grid-action-tooltip.svelte";
  import type { MediaBase, MediaImage } from "@utils/media/media-models";
  import { formatBytes } from "@utils/utils";
  import { SvelteSet } from "svelte/reactivity";
  import { fade, scale } from "svelte/transition";

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

  const minColWidthCss = $derived(
    gridSize === "tiny"
      ? "clamp(88px, 22vw, 120px)"
      : gridSize === "small"
        ? "clamp(120px, 38vw, 180px)"
        : gridSize === "medium"
          ? "clamp(140px, 28vw, 240px)"
          : "clamp(180px, 22vw, 300px)",
  );

  	let showTagModal = $state(false);
  	let taggingFile = $state<MediaImage | null>(null);
  	let fileUploadInput = $state<HTMLInputElement>();
  	let failedImages = $state(new SvelteSet<string>());

  const BATCH_SIZE = 60;
  let visibleCount = $state(BATCH_SIZE);
  let scrollRoot = $state<HTMLElement>();
  let sentinel = $state<HTMLElement>();

  const visibleFiles = $derived(filteredFiles.slice(0, visibleCount));
  const hasMore = $derived(visibleCount < filteredFiles.length);

  $effect(() => {
    void filteredFiles;
    visibleCount = BATCH_SIZE;
    scrollRoot?.scrollTo({ top: 0 });
  });

  $effect(() => {
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && visibleCount < filteredFiles.length) {
          visibleCount = Math.min(visibleCount + BATCH_SIZE, filteredFiles.length);
        }
      },
      { root: scrollRoot ?? null, rootMargin: "600px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  });

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
    if (!isSelectionMode) {
      onOpenFileDetails(file);
    }
  }

  function handleKeyDown(e: KeyboardEvent, file: MediaBase | MediaImage) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!isSelectionMode) {
        onOpenFileDetails(file);
      }
    }
  }

  function openTagEditor(file: MediaImage) {
    taggingFile = file;
    showTagModal = true;
  }

  function getDimensionsLabel(file: MediaBase | MediaImage): string {
    const img = file as MediaImage;
    if (img.width && img.height) return `${img.width}x${img.height}`;
    return "N/A";
  }

  /** Return thumbnail size keys excluding _webp variants (grouped into the same row). */
  function deriveSizeKeys(thumbnails: Record<string, any>): string[] {
    return Object.keys(thumbnails).filter((k) => !k.endsWith('_webp') && thumbnails[k]);
  }

  /** Get the webp variant key for a given thumbnail size, if it exists. */
  function getWebpKey(thumbnails: Record<string, any>, sizeKey: string): string | null {
    const webp = `${sizeKey}_webp`;
    return thumbnails[webp]?.size ? webp : null;
  }

  /**
   * Detect if the thumbnails record has _webp variant entries.
   * When MEDIA_OUTPUT_FORMAT is "webp" or "avif", no _webp suffix variants are generated.
   */
  function hasWebpVariants(thumbnails: Record<string, any>): boolean {
    return Object.keys(thumbnails).some((k) => k.endsWith('_webp'));
  }

  /**
   * Derive the primary thumbnail format label from the first thumbnail's mimeType.
   * Handles: webp, avif, jpeg, png, gif, etc.
   */
  function primaryFormatLabel(thumbnails: Record<string, any>): string {
    const keys = deriveSizeKeys(thumbnails);
    if (!keys.length) return 'Size';
    const mime = (thumbnails[keys[0]] as any)?.mimeType || '';
    if (mime === 'image/webp') return 'WebP';
    if (mime === 'image/avif') return 'AVIF';
    if (mime === 'image/jpeg') return 'JPEG';
    if (mime === 'image/png') return 'PNG';
    if (mime === 'image/gif') return 'GIF';
    // Extract clean label from mime
    const fmt = mime.split('/').pop();
    return fmt ? fmt.toUpperCase() : 'Size';
  }

  const actionBtnClass =
    "flex h-8 w-8 min-w-0 shrink-0 items-center justify-center rounded-full bg-black/45 p-0! shadow-sm backdrop-blur-sm transition-colors hover:bg-black/60";
</script>

<div
  bind:this={scrollRoot}
  class="media-grid-scroll grid min-h-0 flex-1 content-start items-stretch gap-x-2 gap-y-3 overflow-y-auto overflow-x-hidden p-2 sm:gap-x-3 sm:gap-y-4 sm:p-3"
  style:grid-template-columns="repeat(auto-fill, minmax({minColWidthCss}, 1fr))"
  role="grid"
  tabindex="-1"
  aria-label="Media asset grid"
  data-testid="media-grid"
>
  {#if filteredFiles.length === 0}
    <div
      class="col-span-full flex min-h-full flex-col items-center justify-center gap-3 py-16 text-center"
      transition:scale={{ duration: 200 }}
      data-testid="media-grid-empty"
    >
      <iconify-icon icon="mdi:cloud-upload-outline" width="48" class="text-surface-400 dark:text-surface-500"></iconify-icon>
      <div class="space-y-1">
        <h3 class="text-base font-semibold">No media found</h3>
        <p class="max-w-xs text-sm text-surface-500 dark:text-surface-400">
          Drop files here or use the upload button to start building your library.
        </p>
      </div>

      <Button variant="tertiary" onclick={() => fileUploadInput?.click()}>
        <iconify-icon icon="mdi:plus" width="18"></iconify-icon>
        <span>Upload First File</span>
      </Button>
      <input aria-label="Filter media"
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
    {#each visibleFiles as file (file._id || file.filename)}
      {const fileId = file._id?.toString() || file.filename}
      {const isSelected = selectedFiles.has(fileId)}

      <div
        class="group relative flex h-full flex-col focus-within:outline-none
          {isSelected ? 'ring-1 ring-inset ring-primary-500/50' : ''}"
        role="gridcell"
        tabindex="-1"
        aria-selected={isSelected}
        in:fade={{ duration: 180 }}
      >
        {#if isSelected}
          <div class="absolute inset-y-0 inset-s-0 z-10 w-0.5 bg-primary-500" aria-hidden="true"></div>
        {/if}

        {#if isSelectionMode || isSelected}
          <div
            class="absolute inset-s-1.5 top-1.5 z-20 sm:inset-s-2 sm:top-2"
            in:scale={{ duration: 180 }}
            role="presentation"
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
          >
            <Checkbox
              checked={isSelected}
              onchange={() => toggleSelection(file)}
              label="Select {file.filename}"
              hideLabel
              size="sm"
            />
          </div>
        {/if}

        <div class="media-checkerboard relative aspect-square w-full overflow-hidden rounded-t-lg">
          <Button
            type="button"
            class="relative h-full w-full text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
            onclick={() => handleItemClick(file)}
            onkeydown={(e: KeyboardEvent) => handleKeyDown(e, file)}
            aria-label="Preview {file.filename}"
          >
            {#if file.type === "image" && !failedImages.has(fileId)}
              <div
                class="h-full w-full transition-colors duration-500"
                style:background-color={(file.metadata?.dominantColor as string) || 'transparent'}
              >
                {#if file.metadata?.placeholder}
                  <img
                    src={file.metadata.placeholder as string}
                    alt=""
                    class="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-xl"
                    aria-hidden="true"
                  />
                {/if}

                <img
                  src={file.url}
                  alt=""
                  class="relative h-full w-full object-cover transition-transform duration-300 sm:group-hover:scale-[1.02]"
                  style:object-position={file.metadata?.focalPoint
                    ? `${file.metadata.focalPoint.x}% ${file.metadata.focalPoint.y}%`
                    : "center"}
                  loading="lazy"
                  onerror={() => failedImages.add(fileId)}
                  onload={(e) => (e.currentTarget as HTMLElement).classList.add('opacity-100')}
                />
              </div>
            {:else}
              <div class="flex h-full w-full items-center justify-center bg-surface-100/80 dark:bg-surface-800/80">
                <iconify-icon
                  icon={file.type === "image" ? "mdi:image-off-outline" : getFileIcon(file)}
                  width={36}
                  class="text-surface-400 dark:text-surface-500"
                ></iconify-icon>
              </div>
            {/if}


            <div
              class="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-black/75 via-black/30 to-transparent px-2.5 pb-2 pt-8 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
            >
              <p class="truncate text-[11px] font-medium leading-tight text-white" title={file.filename}>
                {file.filename}
              </p>
            </div>
          </Button>


          <div
            class="absolute inset-e-2 top-2 z-20 flex flex-col gap-1 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
            data-testid="media-grid-actions"
          >
            <MediaGridActionTooltip
              theme="light"
              ariaLabel="Details for {file.filename}"
              class="{actionBtnClass} hidden sm:flex"
              onclick={(e) => e.stopPropagation()}
            >
              {#snippet children()}
                <span class="font-serif text-sm font-semibold italic leading-none text-primary-500">i</span>
              {/snippet}
              {#snippet content()}
                <div class="flex flex-col text-[11px] text-surface-800 dark:text-surface-200 min-w-60">
                  <div class="border-b border-surface-300 dark:border-surface-700 pb-2 mb-0 text-center text-[13px]">
                    File NAME : {file.filename}
                  </div>
                  <table class="w-full text-start border-collapse mt-2">
                    <thead>
                      <tr class="border-b border-surface-300 dark:border-surface-700 text-primary-600 dark:text-primary-400">
                        <th class="font-bold py-1 px-2 border-e border-surface-300 dark:border-surface-700 text-start">Size</th>
                        <th class="font-bold py-1 px-2 border-e border-surface-300 dark:border-surface-700 text-center">Pixel</th>
                        <th class="font-bold py-1 px-2 text-end" colspan="2">Size</th>
                      </tr>
                    </thead>
                    <tbody class="text-surface-700 dark:text-surface-300">
                      <tr class="border-b border-surface-300 dark:border-surface-700">
                        <td class="py-1 px-2 font-bold text-primary-600 dark:text-primary-400 border-e border-surface-300 dark:border-surface-700 text-start">original</td>
                        <td class="py-1 px-2 text-center border-e border-surface-300 dark:border-surface-700">{getDimensionsLabel(file) || '-'}</td>
                        <td class="py-1 px-2 text-end tabular-nums" colspan="2">{formatBytes(file.size)}</td>
                      </tr>
                      {#if file.thumbnails}
                        {@const hasWebp = hasWebpVariants(file.thumbnails)}
                        {@const primaryLabel = primaryFormatLabel(file.thumbnails)}
                        <tr class="border-b border-surface-300 dark:border-surface-700">
                          <td class="py-1 px-2 font-bold text-surface-500 dark:text-surface-400 border-e border-surface-300 dark:border-surface-700 text-start" colspan="4">
                            Resized variants — {primaryLabel}{#if hasWebp} + WebP{/if}
                          </td>
                        </tr>
                        {#each deriveSizeKeys(file.thumbnails) as sizeKey (sizeKey)}
                          {@const webpKey = getWebpKey(file.thumbnails, sizeKey)}
                          {@const thumb = file.thumbnails[sizeKey]!}
                          <tr class="border-b border-surface-300 dark:border-surface-700 last:border-0">
                            <td class="py-1 px-2 font-bold text-primary-600 dark:text-primary-400 border-e border-surface-300 dark:border-surface-700 text-start">{sizeKey}</td>
                            <td class="py-1 px-2 text-center border-e border-surface-300 dark:border-surface-700">
                              {thumb.width}x{thumb.height}
                            </td>
                            {#if hasWebp}
                              <td class="py-1 px-2 text-end tabular-nums border-e border-surface-300 dark:border-surface-700">
                                {(thumb as any).size ? formatBytes((thumb as any).size) : '-'}
                              </td>
                              <td class="py-1 px-2 text-end tabular-nums">
                                {#if webpKey}
                                  {formatBytes((file.thumbnails[webpKey] as any).size)}
                                {:else}
                                  <span class="text-surface-400 dark:text-surface-600">—</span>
                                {/if}
                              </td>
                            {:else}
                              <td class="py-1 px-2 text-end tabular-nums">
                                {(thumb as any).size ? formatBytes((thumb as any).size) : '-'}
                              </td>
                            {/if}
                          </tr>
                        {/each}
                      {/if}
                    </tbody>
                  </table>
                </div>
              {/snippet}
            </MediaGridActionTooltip>

            <MediaGridActionTooltip
              title="Edit"
              ariaLabel="Edit {file.filename}"
              class={actionBtnClass}
              data-testid="media-edit-button"
              onclick={(e) => {
                e.stopPropagation();
                onEditImage(file as MediaImage);
              }}
            >
              {#snippet children()}
                <iconify-icon icon="mdi:pencil" width={15} class="text-surface-300"></iconify-icon>
              {/snippet}
            </MediaGridActionTooltip>

            {#if file.type === 'image'}
              <MediaGridActionTooltip
                title="Tags"
                ariaLabel="Tags for {file.filename}"
                class={actionBtnClass}
                onclick={(e) => {
                  e.stopPropagation();
                  openTagEditor(file as MediaImage);
                }}
              >
                {#snippet children()}
                  <iconify-icon
                    icon={(file as MediaImage).metadata?.tags?.length || (file as MediaImage).metadata?.aiTags?.length ? 'mdi:tag' : 'mdi:tag-outline'}
                    width={15}
                    class="text-surface-300"
                  ></iconify-icon>
                {/snippet}
              </MediaGridActionTooltip>
            {/if}

            <MediaGridActionTooltip
              title="Delete"
              ariaLabel="Delete {file.filename}"
              class={actionBtnClass}
              onclick={(e) => {
                e.stopPropagation();
                ondeleteImage(file);
              }}
            >
              {#snippet children()}
                <iconify-icon icon="mdi:trash-can-outline" width={15} class="text-error-500"></iconify-icon>
              {/snippet}
            </MediaGridActionTooltip>
          </div>
        </div>

        <div class="mt-1.5 flex items-baseline justify-between gap-2 border-b border-surface-200 px-1.5 pb-2 pt-0.5 sm:px-2 dark:border-surface-800">
          <span class="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wide text-surface-500 sm:text-[11px] dark:text-surface-400">
            {formatMimeType(file.mimeType)}
          </span>
          <span class="shrink-0 font-mono text-[10px] tabular-nums text-surface-400 sm:text-[11px] dark:text-surface-500">
            {formatBytes(file.size)}
          </span>
        </div>
      </div>
    {/each}

    {#if hasMore}
      <div
        bind:this={sentinel}
        class="col-span-full flex items-center justify-center gap-2 py-5 font-mono text-[11px] text-surface-400 dark:text-surface-500"
        aria-hidden="true"
      >
        <iconify-icon icon="mdi:loading" width="18" class="animate-spin"></iconify-icon>
        <span>Loading more…</span>
      </div>
    {/if}
  {/if}
</div>

<TagEditorModal
  bind:show={showTagModal}
  bind:file={taggingFile}
  onUpdate={onUpdateImage}
  hideGenerate={true}
/>

<style>
  .media-checkerboard {
    background-color: var(--color-surface-100);
    background-image:
      linear-gradient(45deg, var(--color-surface-200) 25%, transparent 25%),
      linear-gradient(-45deg, var(--color-surface-200) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--color-surface-200) 75%),
      linear-gradient(-45deg, transparent 75%, var(--color-surface-200) 75%);
    background-size: 12px 12px;
    background-position:
      0 0,
      0 6px,
      6px -6px,
      -6px 0;
  }

  :global(.dark) .media-checkerboard {
    background-color: var(--color-surface-900);
    background-image:
      linear-gradient(45deg, var(--color-surface-800) 25%, transparent 25%),
      linear-gradient(-45deg, var(--color-surface-800) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--color-surface-800) 75%),
      linear-gradient(-45deg, transparent 75%, var(--color-surface-800) 75%);
  }

  .media-grid-scroll {
    scrollbar-width: thin;
    scrollbar-color: var(--color-surface-300) transparent;
  }

  .media-grid-scroll::-webkit-scrollbar {
    width: 6px;
  }

  .media-grid-scroll::-webkit-scrollbar-thumb {
    border-radius: 4px;
    background: var(--color-surface-300);
  }

  :global(.dark) .media-grid-scroll::-webkit-scrollbar-thumb {
    background: var(--color-surface-700);
  }
</style>
