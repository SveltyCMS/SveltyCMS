<!--
@file src/components/media/media-details-modal.svelte
@component
**Interactive asset control center for Media Details, Versioning, Usage References, and Share management**

### Features:
- Dynamic tabbed navigation (Info, Versioning, References, Sharing)
- Version history listing with upload, restore, and direct download links
- Live scan for collection references and usage
- Password-secured expiring link generator with clipboard integration
- High-fidelity visual previews for Images, Audio, Video, and Documents
-->

<script lang="ts">
  import { fade } from "svelte/transition";
  import { formatBytes } from "@utils/utils";
  import { toast } from "@src/stores/toast.svelte.ts";
  import { mediaUrl } from "@utils/media/media-utils";

  // Props
  let {
    file = $bindable(null),
    onUpdate = () => {},
    close = () => {},
  }: {
    file: any;
    onUpdate?: (updatedFile: any) => void;
    close?: () => void;
  } = $props();

  // Tab State
  let activeTab = $state<"info" | "versions" | "references" | "share">("info");

  // Info Tab State
  let newTagInput = $state("");
  let isSavingTags = $state(false);

  // Versions Tab State
  let isUploadingVersion = $state(false);
  let isRestoringVersion = $state(false);
  let fileInputEl = $state<HTMLInputElement | null>(null);

  // References Tab State
  let isScanningRefs = $state(false);
  let references = $state<any[]>([]);

  // Share Tab State
  let expiryHours = $state<number | null>(24);
  let sharePassword = $state("");
  let isCreatingShare = $state(false);

  // Helper for MIME display
  function formatMime(mime?: string) {
    if (!mime) return "Unknown";
    return mime.split("/")[1]?.toUpperCase() || mime.toUpperCase();
  }

  // Load references automatically when tab switches to references
  $effect(() => {
    if (activeTab === "references" && file?._id) {
      scanReferences();
    }
  });

  // ── Info Tab logic ──────────────────────────────────────────────────────────
  async function handleAddTag(e: KeyboardEvent | MouseEvent) {
    if (e instanceof KeyboardEvent && e.key !== "Enter") return;
    if (!newTagInput.trim() || !file?._id) return;

    isSavingTags = true;
    try {
      const currentTags = file.metadata?.tags || [];
      if (currentTags.includes(newTagInput.trim())) {
        toast.error("Tag already exists");
        return;
      }

      const updatedMetadata = {
        ...file.metadata,
        tags: [...currentTags, newTagInput.trim()],
      };

      const response = await fetch(`/api/media/${file._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: updatedMetadata }),
      });

      if (response.ok) {
        const body = await response.json();
        if (body.success) {
          file = body.data;
          onUpdate(file);
          newTagInput = "";
          toast.success("Tag added successfully");
        }
      } else {
        toast.error("Failed to add tag");
      }
    } catch (err) {
      toast.error("An error occurred while adding tag");
    } finally {
      isSavingTags = false;
    }
  }

  async function handleRemoveTag(tagToRemove: string) {
    if (!file?._id) return;

    try {
      const currentTags = file.metadata?.tags || [];
      const updatedMetadata = {
        ...file.metadata,
        tags: currentTags.filter((t: string) => t !== tagToRemove),
      };

      const response = await fetch(`/api/media/${file._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: updatedMetadata }),
      });

      if (response.ok) {
        const body = await response.json();
        if (body.success) {
          file = body.data;
          onUpdate(file);
          toast.success("Tag removed");
        }
      } else {
        toast.error("Failed to remove tag");
      }
    } catch (err) {
      toast.error("An error occurred while removing tag");
    }
  }

  // ── Versioning Tab logic ───────────────────────────────────────────────────
  function triggerFileInput() {
    fileInputEl?.click();
  }

  async function handleVersionUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length || !file?._id) return;

    isUploadingVersion = true;
    const formData = new FormData();
    formData.append("file", input.files[0]);

    try {
      const response = await fetch(`/api/media/version/${file._id}`, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const body = await response.json();
        if (body.success) {
          file = body.data;
          onUpdate(file);
          toast.success("New version uploaded successfully");
        }
      } else {
        const err = await response.json().catch(() => ({}));
        toast.error(err.message || "Failed to upload version");
      }
    } catch (err) {
      toast.error("An error occurred during version upload");
    } finally {
      isUploadingVersion = false;
      input.value = ""; // reset file input
    }
  }

  async function handleRestoreVersion(versionNumber: number) {
    if (!file?._id) return;

    isRestoringVersion = true;
    try {
      const response = await fetch(`/api/media/version/${file._id}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionNumber }),
      });

      if (response.ok) {
        const body = await response.json();
        if (body.success) {
          file = body.data;
          onUpdate(file);
          toast.success(`Successfully restored version #${versionNumber}`);
        }
      } else {
        const err = await response.json().catch(() => ({}));
        toast.error(err.message || "Failed to restore version");
      }
    } catch (err) {
      toast.error("An error occurred during version restore");
    } finally {
      isRestoringVersion = false;
    }
  }

  // ── References Tab logic ───────────────────────────────────────────────────
  async function scanReferences() {
    if (!file?._id) return;

    isScanningRefs = true;
    try {
      const response = await fetch(`/api/media/references/${file._id}`);
      if (response.ok) {
        const body = await response.json();
        if (body.success) {
          references = body.data || [];
        }
      } else {
        toast.error("Failed to load references scan");
      }
    } catch (err) {
      toast.error("An error occurred scanning references");
    } finally {
      isScanningRefs = false;
    }
  }

  // ── Share Tab logic ────────────────────────────────────────────────────────
  async function handleGenerateShareLink() {
    if (!file?._id) return;

    isCreatingShare = true;
    try {
      const response = await fetch(`/api/media/share/${file._id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expiryHours: expiryHours,
          password: sharePassword.trim() || undefined,
        }),
      });

      if (response.ok) {
        const body = await response.json();
        if (body.success) {
          // reload the media file to get updated share lists
          const reloadRes = await fetch(`/api/media/${file._id}`);
          const reloadBody = await reloadRes.json();
          if (reloadBody.success) {
            file = reloadBody.data;
            onUpdate(file);
          }
          sharePassword = "";
          toast.success("Public share link generated!");
        }
      } else {
        toast.error("Failed to generate share link");
      }
    } catch (err) {
      toast.error("An error occurred generating share link");
    } finally {
      isCreatingShare = false;
    }
  }

  async function handleRevokeShareLink(token: string) {
    if (!file?._id) return;

    try {
      const response = await fetch(`/api/media/share/${file._id}/${token}`, {
        method: "DELETE",
      });

      if (response.ok) {
        const body = await response.json();
        if (body.success) {
          file.metadata.sharedLinks = file.metadata.sharedLinks.filter((l: any) => l.token !== token);
          onUpdate(file);
          toast.success("Share link revoked");
        }
      } else {
        toast.error("Failed to revoke share link");
      }
    } catch (err) {
      toast.error("An error occurred revoking share link");
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success("Copied to clipboard!"),
      () => toast.error("Failed to copy link"),
    );
  }

  function getShareLinkUrl(token: string) {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/share/${token}?id=${file._id}`;
  }

  function isExpired(expiry?: string | null) {
    if (!expiry) return false;
    return new Date() > new Date(expiry);
  }
</script>

<div class="media-details-container flex flex-col md:flex-row gap-6 max-h-[90vh] overflow-hidden text-surface-900 dark:text-surface-100 p-4">
  <!-- Left Side: Asset Preview -->
  <div class="preview-section flex-1 flex flex-col justify-center items-center bg-surface-100/50 dark:bg-surface-950/40 border border-surface-200 dark:border-surface-800 rounded-2xl p-4 min-h-75 md:min-h-125 relative">
    {#if file.type === 'image'}
      <div
        class="preview-image-box w-full h-full flex items-center justify-center rounded overflow-hidden relative"
        style:background-color={file.metadata?.dominantColor || 'transparent'}
      >
        <img
          src={mediaUrl(file)}
          alt={file.filename}
          class="max-w-full max-h-105 object-contain rounded shadow-lg"
          style:object-position={file.metadata?.focalPoint ? `${file.metadata.focalPoint.x}% ${file.metadata.focalPoint.y}%` : 'center'}
        />
      </div>
    {:else if file.type === 'video'}
      <video
        src={mediaUrl(file)}
        controls
        class="max-w-full max-h-105 rounded shadow-lg"
      >
        <track kind="captions" />
      </video>
    {:else if file.type === 'audio'}
      <div class="audio-preview flex flex-col items-center gap-4 w-full max-w-sm">
        <div class="audio-icon-box bg-tertiary-500 dark:bg-primary-500/10 text-tertiary-500 dark:text-primary-500 p-6 rounded-full">
          <iconify-icon icon="mdi:music-note" width="48"></iconify-icon>
        </div>
        <audio src={mediaUrl(file)} controls class="w-full"></audio>
      </div>
    {:else}
      <div class="file-fallback flex flex-col items-center gap-4">
        <div class="file-icon-box bg-surface-200 dark:bg-surface-800 text-surface-500 p-8 rounded-2xl border border-surface-300 dark:border-surface-700">
          <iconify-icon icon="mdi:file-document-outline" width="64"></iconify-icon>
        </div>
        <span class="font-mono text-sm opacity-60">{formatMime(file.mimeType)}</span>
      </div>
    {/if}

    <div class="mt-4 flex gap-2">
      <a
        href={mediaUrl(file)}
        download={file.filename}
        class="btn preset-tonal-primary text-xs"
        target="_blank"
        rel="noopener noreferrer"
      >
        <iconify-icon icon="mdi:download-outline" width="16"></iconify-icon>
        <span>Download Original</span>
      </a>
    </div>
  </div>

  <!-- Right Side: Details & Tabbed Management -->
  <div class="details-section flex-1 flex flex-col overflow-hidden">
    <!-- Header -->
    <div class="modal-header flex items-start justify-between border-b border-surface-200 dark:border-surface-800 pb-4 mb-4">
      <div>
        <h2 class="h4 font-bold text-ellipsis overflow-hidden max-w-[320px] whitespace-nowrap" title={file.filename}>
          {file.filename}
        </h2>
        <p class="text-xs opacity-60 font-mono mt-1">{file._id}</p>
      </div>
      <button onclick={close} class="btn-icon hover:bg-surface-200 dark:hover:bg-surface-800" aria-label="Close modal">
        <iconify-icon icon="mdi:close" width="20"></iconify-icon>
      </button>
    </div>

    <!-- Navigation Tabs -->
    <div class="tabs-container flex border-b border-surface-200 dark:border-surface-800 mb-4 text-sm font-semibold">
      <button
        onclick={() => activeTab = 'info'}
        class="px-4 py-2 border-b-2 transition-all {activeTab === 'info' ? 'border-tertiary-500 dark:border-primary-500 text-tertiary-500 dark:text-primary-500' : 'border-transparent opacity-60 hover:opacity-100'}"
        aria-label="info-tags-tab"
      >
        Info & Tags
      </button>
      <button
        onclick={() => activeTab = 'versions'}
        class="px-4 py-2 border-b-2 transition-all {activeTab === 'versions' ? 'border-tertiary-500 dark:border-primary-500 text-tertiary-500 dark:text-primary-500' : 'border-transparent opacity-60 hover:opacity-100'}"
        aria-label="versions-tab"
      >
        Versions ({file.versions?.length || 0})
      </button>
      <button
        onclick={() => activeTab = 'references'}
        class="px-4 py-2 border-b-2 transition-all {activeTab === 'references' ? 'border-tertiary-500 dark:border-primary-500 text-tertiary-500 dark:text-primary-500' : 'border-transparent opacity-60 hover:opacity-100'}"
        aria-label="usage-tab"
      >
        Usage
      </button>
      <button
        onclick={() => activeTab = 'share'}
        class="px-4 py-2 border-b-2 transition-all {activeTab === 'share' ? 'border-tertiary-500 dark:border-primary-500 text-tertiary-500 dark:text-primary-500' : 'border-transparent opacity-60 hover:opacity-100'}"
        aria-label="share-links-tab"
      >
        Share Links ({file.metadata?.sharedLinks?.length || 0})
      </button>
    </div>

    <!-- Tab Contents (Scrollable) -->
    <div class="tab-content flex-1 overflow-y-auto pe-1">
      {#if activeTab === 'info'}
        <div in:fade={{ duration: 150 }} class="flex flex-col gap-4">
          <!-- Metadata Table -->
          <div class="bg-surface-100 dark:bg-surface-900/60 border border-surface-200 dark:border-surface-800 rounded p-4 font-mono text-xs flex flex-col gap-2">
            <div class="flex justify-between"><span class="opacity-60">Mime-Type:</span><span>{file.mimeType}</span></div>
            <div class="flex justify-between"><span class="opacity-60">File Size:</span><span>{formatBytes(file.size)}</span></div>
            {#if file.width && file.height}
              <div class="flex justify-between"><span class="opacity-60">Dimensions:</span><span>{file.width} x {file.height} px</span></div>
            {/if}
            <div class="flex justify-between"><span class="opacity-60">Folder:</span><span>{file.folder || 'global'}</span></div>
            <div class="flex justify-between"><span class="opacity-60">Created:</span><span>{new Date(file.createdAt).toLocaleString()}</span></div>
            <div class="flex justify-between"><span class="opacity-60">Updated:</span><span>{new Date(file.updatedAt).toLocaleString()}</span></div>
          </div>

          <!-- Tags Area -->
          <div class="tags-section">
            <h3 class="font-bold text-sm mb-2">Asset Tags</h3>

            <div class="flex flex-wrap gap-1.5 mb-3">
              {#each file.metadata?.tags || [] as tag}
                <span class="tag-badge bg-tertiary-500 dark:bg-primary-500/10 text-tertiary-600 dark:text-primary-600 border border-tertiary-500 dark:border-primary-500/20 px-2 py-0.5 rounded text-xs flex items-center gap-1">
                  <span>{tag}</span>
                  <button
                    onclick={() => handleRemoveTag(tag)}
                    class="hover:text-error-500"
                    aria-label={`remove-tag-${tag}`}
                  >
                    <iconify-icon icon="mdi:close-circle" width="12"></iconify-icon>
                  </button>
                </span>
              {:else}
                <span class="text-xs opacity-60">No tags added yet.</span>
              {/each}
            </div>

            <div class="flex gap-2">
              <input
                type="text"
                bind:value={newTagInput}
                onkeydown={handleAddTag}
                placeholder="Add tag..."
                class="input text-sm py-1.5"
                disabled={isSavingTags}
                aria-label="add-tag"
              />
              <button
                onclick={handleAddTag}
                class="btn preset-filled-tertiary-500 dark:preset-filled-primary-500 text-xs py-1.5 px-3"
                disabled={isSavingTags || !newTagInput.trim()}
                aria-label="add-tag-button"
              >
                Add
              </button>
            </div>
          </div>
        </div>

      {:else if activeTab === 'versions'}
        <div in:fade={{ duration: 150 }} class="flex flex-col gap-4">
          <!-- Upload New Version -->
          <div class="bg-surface-100 dark:bg-surface-900/60 border border-surface-200 dark:border-surface-800 rounded p-4 flex flex-col items-center gap-3">
            <iconify-icon icon="mdi:cloud-upload-outline" width="32" class="opacity-60"></iconify-icon>
            <div class="text-center">
              <h4 class="font-bold text-sm">Replace or Update File</h4>
              <p class="text-xs opacity-60 mt-0.5">Upload a new file. The current name will be preserved, and the old version will be stored in history.</p>
            </div>

            <input
              type="file"
              bind:this={fileInputEl}
              onchange={handleVersionUpload}
              class="hidden"
              aria-label="upload-new-version"
            />
            <button
              onclick={triggerFileInput}
              class="btn preset-filled-tertiary-500 dark:preset-filled-primary-500 text-xs px-4"
              disabled={isUploadingVersion}
              aria-label="upload-new-version-button"
            >
              {#if isUploadingVersion}
                <iconify-icon icon="mdi:loading" class="animate-spin" width="16"></iconify-icon>
                <span>Uploading...</span>
              {:else}
                <iconify-icon icon="mdi:upload" width="16"></iconify-icon>
                <span>Upload New Version</span>
              {/if}
            </button>
          </div>

          <!-- Version History -->
          <div class="history-list">
            <h3 class="font-bold text-sm mb-2">Version History</h3>
            <div class="flex flex-col gap-2">
              <!-- Current Active Version -->
              <div class="version-item bg-tertiary-500 dark:bg-primary-500/5 border border-tertiary-500 dark:border-primary-500/20 rounded p-3 flex justify-between items-center text-xs">
                <div class="flex items-center gap-3">
                  <div class="version-badge bg-tertiary-500 dark:bg-primary-500 text-white font-bold px-2 py-0.5 rounded text-[10px]">
                    ACTIVE
                  </div>
                  <div>
                    <p class="font-semibold">{file.filename}</p>
                    <p class="opacity-60 mt-0.5 font-mono">Current • {formatBytes(file.size)} • {new Date(file.updatedAt).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <!-- History versions -->
              {#each file.versions || [] as ver}
                <div class="version-item bg-surface-100 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded p-3 flex justify-between items-center text-xs">
                  <div class="flex items-center gap-3">
                    <div class="version-badge bg-surface-300 dark:bg-surface-700 text-surface-800 dark:text-surface-200 font-bold px-2 py-0.5 rounded text-[10px]">
                      v{ver.versionNumber}
                    </div>
                    <div>
                      <p class="font-semibold text-ellipsis max-w-50 overflow-hidden whitespace-nowrap" title={ver.filename}>{ver.filename}</p>
                      <p class="opacity-60 mt-0.5 font-mono">
                        {formatBytes(ver.size)} • {new Date(ver.updatedAt).toLocaleString()}
                        {#if ver.updatedBy}
                          • by {ver.updatedBy}
                        {/if}
                      </p>
                    </div>
                  </div>

                  <div class="flex gap-2">
                    <a
                      href={mediaUrl({ url: ver.path } as any)}
                      download={ver.filename}
                      class="btn-icon btn-icon-sm bg-surface-200 dark:bg-surface-800 hover:bg-surface-300 dark:hover:bg-surface-750"
                      title="Download Version"
                    >
                      <iconify-icon icon="mdi:download-outline" width="14"></iconify-icon>
                    </a>
                    <button
                      onclick={() => handleRestoreVersion(ver.versionNumber)}
                      class="btn preset-tonal-secondary text-[10px] py-1 px-2.5 flex items-center gap-1"
                      disabled={isRestoringVersion}
                      aria-label="restore-version"
                    >
                      Restore
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>

      {:else if activeTab === 'references'}
        <div in:fade={{ duration: 150 }} class="flex flex-col gap-4">
          {#if isScanningRefs}
            <div class="flex flex-col items-center justify-center p-8 gap-3">
              <iconify-icon icon="mdi:loading" class="animate-spin text-tertiary-500 dark:text-primary-500" width="32"></iconify-icon>
              <span class="text-xs opacity-60">Scanning collections for usage references...</span>
            </div>
          {:else}
            <div class="references-list">
              <h3 class="font-bold text-sm mb-2">Usage Scanner</h3>
              <p class="text-xs opacity-60 mb-4">Lists all content entries where this media asset is referenced.</p>

              <div class="flex flex-col gap-2">
                {#each references as ref}
                  <div class="reference-item bg-surface-100 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded p-3 flex justify-between items-center text-xs">
                    <div>
                      <span class="font-bold text-tertiary-500 dark:text-primary-500 uppercase tracking-wider text-[10px]">{ref.collection}</span>
                      <p class="font-semibold mt-0.5">Field: <span class="font-mono">{ref.field}</span></p>
                      <p class="opacity-60 mt-0.5 font-mono">Entry ID: {ref.entryId}</p>
                    </div>

                    <a
                      href="/content/{ref.collection}/{ref.entryId}"
                      class="btn preset-tonal-primary text-[10px] py-1 px-2.5"
                    >
                      Go to Entry
                    </a>
                  </div>
                {:else}
                  <div class="bg-surface-50 dark:bg-surface-900/40 border-2 border-dashed border-surface-200 dark:border-surface-800 rounded p-6 text-center">
                    <iconify-icon icon="mdi:link-variant-off" width="32" class="opacity-40 mb-2"></iconify-icon>
                    <p class="text-xs opacity-60">This asset is not referenced in any collections.</p>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>

      {:else if activeTab === 'share'}
        <div in:fade={{ duration: 150 }} class="flex flex-col gap-4">
          <!-- Generate Share Link Form -->
          <div class="bg-surface-100 dark:bg-surface-900/60 border border-surface-200 dark:border-surface-800 rounded p-4 flex flex-col gap-3 text-xs">
            <h4 class="font-bold text-sm">Create Expiring Public Link</h4>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block opacity-60 mb-1" for="expiry-hours">Expiration (Hours):</label>
                <select bind:value={expiryHours} id="expiry-hours" class="select text-xs py-1.5 w-full">
                  <option value={1}>1 Hour</option>
                  <option value={24}>24 Hours (1 Day)</option>
                  <option value={168}>168 Hours (7 Days)</option>
                  <option value={null}>Never Expires</option>
                </select>
              </div>
              <div>
                <label class="block opacity-60 mb-1" for="share-password">Password (Optional):</label>
                <input
                  type="password"
                  bind:value={sharePassword}
                  id="share-password"
                  placeholder="Set password..."
                  class="input text-xs py-1.5 w-full"
                  aria-label="share-password"
                />
              </div>
            </div>

            <button
              onclick={handleGenerateShareLink}
              class="btn preset-filled-tertiary-500 dark:preset-filled-primary-500 text-xs py-1.5 w-full mt-2"
              disabled={isCreatingShare}
              aria-label="generate-sharing-link"
            >
              {#if isCreatingShare}
                <iconify-icon icon="mdi:loading" class="animate-spin" width="16"></iconify-icon>
                <span>Generating...</span>
              {:else}
                <iconify-icon icon="mdi:link-variant" width="16"></iconify-icon>
                <span>Generate Sharing Link</span>
              {/if}
            </button>
          </div>

          <!-- Existing Share Links -->
          <div class="shares-list">
            <h3 class="font-bold text-sm mb-2">Active Sharing Links</h3>
            <div class="flex flex-col gap-2">
              {#each file.metadata?.sharedLinks || [] as link}
                {const expired = isExpired(link.expiry)}
                <div class="share-item bg-surface-100 dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded p-3 flex flex-col gap-2 text-xs">
                  <div class="flex justify-between items-center">
                    <div class="flex gap-2 items-center">
                      <span class="status-dot h-2.5 w-2.5 rounded-full {expired ? 'bg-error-500' : 'bg-success-500'}"></span>
                      <span class="font-mono text-[10px]">{expired ? 'EXPIRED' : 'ACTIVE'}</span>
                      {#if link.passwordHash}
                        <iconify-icon icon="mdi:lock" width="14" class="text-warning-500" title="Password Protected"></iconify-icon>
                      {/if}
                    </div>
                    <span class="opacity-60 text-[10px]">Downloads: {link.downloadCount || 0}</span>
                  </div>

                  <div class="flex gap-2">
                    <input
                      type="text"
                      value={getShareLinkUrl(link.token)}
                      readonly
                      class="input text-[10px] py-1 font-mono flex-1 bg-surface-200 dark:bg-surface-950 border border-surface-300 dark:border-surface-800 rounded"
                      aria-label="share-link-url"
                    />
                    <button
                      onclick={() => copyToClipboard(getShareLinkUrl(link.token))}
                      class="btn preset-tonal-primary text-[10px] py-1 px-2.5"
                      title="Copy Share Link"
                      aria-label="copy-share-link"
                    >
                      Copy
                    </button>
                    <button
                      onclick={() => handleRevokeShareLink(link.token)}
                      class="btn preset-tonal-error text-[10px] py-1 px-2.5"
                      title="Revoke Share Link"
                      aria-label="revoke-share-link"
                    >
                      Revoke
                    </button>
                  </div>

                  {#if link.expiry}
                    <div class="text-[10px] opacity-60">
                      Expires: {new Date(link.expiry).toLocaleString()}
                    </div>
                  {/if}
                </div>
              {:else}
                <div class="text-xs opacity-60 py-4 text-center">No active share links.</div>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .media-details-container {
    width: 850px;
    max-width: 100%;
  }

  .preview-section {
    max-height: 480px;
  }

  .tabs-container {
    gap: 0.5rem;
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Scrollbar styling for smooth UX */
  .tab-content::-webkit-scrollbar {
    width: 6px;
  }
  .tab-content::-webkit-scrollbar-track {
    background: transparent;
  }
  .tab-content::-webkit-scrollbar-thumb {
    background: rgba(156, 163, 175, 0.3);
    border-radius: 9999px;
  }
  .tab-content::-webkit-scrollbar-thumb:hover {
    background: rgba(156, 163, 175, 0.5);
  }
</style>
