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
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
	import Badge from '@components/ui/badge.svelte';
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
  let expiryHoursValue = $state('24');

  function handleExpiryChange(val: string) {
    expiryHours = val === 'never' ? null : Number(val);
  }
  let sharePassword = $state("");
  let isCreatingShare = $state(false);

  // Helper for MIME display
  function formatMime(mime: string | undefined = undefined) {
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

  function isExpired(expiry: string | null | undefined = undefined) {
    if (!expiry) return false;
    return new Date() > new Date(expiry);
  }
</script>

<div class="flex w-full min-w-0 max-w-none flex-col gap-4 overflow-hidden text-surface-900 lg:max-h-[min(85dvh,44rem)] lg:flex-row lg:gap-6 dark:text-surface-100">
  <!-- Asset preview -->
  <div class="flex min-h-0 shrink-0 flex-col items-center justify-center rounded-xl border border-surface-200 bg-surface-50 p-3 sm:p-4 lg:min-h-[18rem] lg:w-[min(100%,20rem)] lg:flex-1 dark:border-surface-800 dark:bg-surface-900/40">
    {#if file.type === 'image'}
      <div
        class="media-checkerboard flex max-h-[min(42dvh,16rem)] w-full flex-1 items-center justify-center overflow-hidden rounded-lg sm:max-h-[min(38dvh,20rem)] lg:max-h-[min(32dvh,18rem)]"
        style:background-color={file.metadata?.dominantColor || undefined}
      >
        <img
          src={mediaUrl(file)}
          alt={file.filename}
          class="max-h-full max-w-full object-contain"
          style:object-position={file.metadata?.focalPoint ? `${file.metadata.focalPoint.x}% ${file.metadata.focalPoint.y}%` : 'center'}
        />
      </div>
    {:else if file.type === 'video'}
      <video
        src={mediaUrl(file)}
        controls
        class="max-h-[min(42dvh,16rem)] w-full max-w-full rounded-lg sm:max-h-[min(38dvh,20rem)] lg:max-h-[min(32dvh,18rem)]"
      >
        <track kind="captions" />
      </video>
    {:else if file.type === 'audio'}
      <div class="flex w-full max-w-sm flex-col items-center gap-4 py-4">
        <div class="rounded-full border border-surface-200 bg-surface-100 p-5 text-primary-500 dark:border-surface-700 dark:bg-surface-800">
          <iconify-icon icon="mdi:music-note" width="40"></iconify-icon>
        </div>
        <audio src={mediaUrl(file)} controls class="w-full"></audio>
      </div>
    {:else}
      <div class="flex flex-col items-center gap-3 py-6">
        <div class="rounded-xl border border-surface-200 bg-surface-100 p-6 text-surface-500 dark:border-surface-700 dark:bg-surface-800">
          <iconify-icon icon="mdi:file-document-outline" width="48"></iconify-icon>
        </div>
        <span class="font-mono text-xs uppercase tracking-wide text-surface-500 dark:text-surface-400">{formatMime(file.mimeType)}</span>
      </div>
    {/if}

    <div class="mt-3 flex w-full justify-center sm:mt-4">
      <Button
        variant="surface"
        size="sm"
        href={mediaUrl(file)}
        download={file.filename}
        target="_blank"
        rel="noopener noreferrer"
        class="h-9 gap-1.5"
      >
        <iconify-icon icon="mdi:download-outline" width="16"></iconify-icon>
        <span>Download Original</span>
      </Button>
    </div>
  </div>

  <!-- Details panel -->
  <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <div class="mb-3 flex shrink-0 items-start justify-between gap-3 border-b border-surface-200 pb-3 dark:border-surface-800">
      <div class="min-w-0 flex-1">
        <h2 class="truncate text-base font-semibold text-surface-800 sm:text-lg dark:text-surface-100" title={file.filename}>
          {file.filename}
        </h2>
        <p class="mt-1 truncate font-mono text-[10px] text-surface-500 sm:text-[11px] dark:text-surface-400">{file._id}</p>
      </div>
      <Button variant="ghost" onclick={close} aria-label="Close modal" class="h-9 w-9 min-w-9 shrink-0 p-0!">
        <iconify-icon icon="mdi:close" width="18"></iconify-icon>
      </Button>
    </div>

    <div class="-mx-1 mb-3 flex shrink-0 gap-1 overflow-x-auto border-b border-surface-200 px-1 pb-px text-sm dark:border-surface-800">
      {#each [
        { id: 'info', label: 'Info & Tags' },
        { id: 'versions', label: `Versions (${file.versions?.length || 0})` },
        { id: 'references', label: 'Usage' },
        { id: 'share', label: `Share (${file.metadata?.sharedLinks?.length || 0})` }
      ] as tab (tab.id)}
        <button
          type="button"
          onclick={() => (activeTab = tab.id as typeof activeTab)}
          class="shrink-0 border-b-2 px-3 py-2 font-medium transition-colors {activeTab === tab.id
            ? 'border-primary-500 text-surface-800 dark:text-surface-100'
            : 'border-transparent text-surface-500 hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200'}"
          aria-label="{tab.label}-tab"
          aria-selected={activeTab === tab.id}
          role="tab"
        >
          {tab.label}
        </button>
      {/each}
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto pe-1">
      {#if activeTab === 'info'}
        <div in:fade={{ duration: 150 }} class="flex flex-col gap-4">
          <div class="rounded-lg border border-surface-200 bg-surface-50 p-3 font-mono text-xs dark:border-surface-800 dark:bg-surface-900/60">
            <dl class="space-y-2">
              <div class="flex items-start justify-between gap-4">
                <dt class="shrink-0 text-surface-500 dark:text-surface-400">Mime-Type</dt>
                <dd class="text-end text-surface-800 dark:text-surface-100">{file.mimeType}</dd>
              </div>
              <div class="flex items-start justify-between gap-4">
                <dt class="shrink-0 text-surface-500 dark:text-surface-400">File Size</dt>
                <dd class="text-end tabular-nums text-surface-800 dark:text-surface-100">{formatBytes(file.size)}</dd>
              </div>
              {#if file.width && file.height}
                <div class="flex items-start justify-between gap-4">
                  <dt class="shrink-0 text-surface-500 dark:text-surface-400">Dimensions</dt>
                  <dd class="text-end tabular-nums text-surface-800 dark:text-surface-100">{file.width} × {file.height} px</dd>
                </div>
              {/if}
              <div class="flex items-start justify-between gap-4">
                <dt class="shrink-0 text-surface-500 dark:text-surface-400">Folder</dt>
                <dd class="text-end text-surface-800 dark:text-surface-100">{file.folder || 'global'}</dd>
              </div>
              <div class="flex items-start justify-between gap-4">
                <dt class="shrink-0 text-surface-500 dark:text-surface-400">Created</dt>
                <dd class="text-end text-surface-800 dark:text-surface-100">{new Date(file.createdAt).toLocaleString()}</dd>
              </div>
              <div class="flex items-start justify-between gap-4">
                <dt class="shrink-0 text-surface-500 dark:text-surface-400">Updated</dt>
                <dd class="text-end text-surface-800 dark:text-surface-100">{new Date(file.updatedAt).toLocaleString()}</dd>
              </div>
            </dl>
          </div>

          <div>
            <h3 class="mb-2 text-sm font-semibold text-surface-800 dark:text-surface-100">Asset Tags</h3>

            <div class="mb-3 flex flex-wrap gap-1.5">
              {#each file.metadata?.tags || [] as tag}
                <Badge variant="surface" preset="tonal" size="sm" class="gap-1 pe-1">
                  <span>{tag}</span>
                  <button
                    type="button"
                    onclick={() => handleRemoveTag(tag)}
                    class="rounded-full p-0.5 text-surface-500 hover:text-error-500"
                    aria-label="Remove tag {tag}"
                  >
                    <iconify-icon icon="mdi:close" width="12"></iconify-icon>
                  </button>
                </Badge>
              {:else}
                <span class="text-xs text-surface-500 dark:text-surface-400">No tags added yet.</span>
              {/each}
            </div>

            <div class="flex items-center gap-2">
              <Input
                type="text"
                bind:value={newTagInput}
                onkeydown={handleAddTag}
                placeholder="Add tag…"
                aria-label="Add tag"
                inputClass="h-9 text-sm"
                class="min-w-0 flex-1"
                disabled={isSavingTags}
              />
              <Button
                variant="surface"
                size="sm"
                onclick={handleAddTag}
                disabled={isSavingTags || !newTagInput.trim()}
                aria-label="Add tag"
                class="h-9 shrink-0 px-3"
              >
                Add
              </Button>
            </div>
          </div>
        </div>

      {:else if activeTab === 'versions'}
        <div in:fade={{ duration: 150 }} class="flex flex-col gap-4">
          <div class="flex flex-col items-center gap-3 rounded-lg border border-surface-200 bg-surface-50 p-4 text-center dark:border-surface-800 dark:bg-surface-900/60">
            <iconify-icon icon="mdi:cloud-upload-outline" width="28" class="text-surface-400"></iconify-icon>
            <div>
              <h4 class="text-sm font-semibold text-surface-800 dark:text-surface-100">Replace or Update File</h4>
              <p class="mt-1 text-xs text-surface-500 dark:text-surface-400">Upload a new file. The current name is preserved and the old version is stored in history.</p>
            </div>

            <input
              type="file"
              bind:this={fileInputEl}
              onchange={handleVersionUpload}
              class="hidden"
              aria-label="Upload new version"
            />
            <Button
              variant="surface"
              size="sm"
              onclick={triggerFileInput}
              disabled={isUploadingVersion}
              aria-label="Upload new version"
              class="h-9 gap-1.5"
            >
              {#if isUploadingVersion}
                <iconify-icon icon="mdi:loading" class="animate-spin" width="16"></iconify-icon>
                <span>Uploading…</span>
              {:else}
                <iconify-icon icon="mdi:upload" width="16"></iconify-icon>
                <span>Upload New Version</span>
              {/if}
            </Button>
          </div>

          <div>
            <h3 class="mb-2 text-sm font-semibold text-surface-800 dark:text-surface-100">Version History</h3>
            <div class="flex flex-col gap-2">
              <div class="flex flex-col gap-3 rounded-lg border border-primary-500/20 bg-primary-500/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div class="flex min-w-0 items-center gap-3">
                  <Badge variant="primary" size="sm">Active</Badge>
                  <div class="min-w-0">
                    <p class="truncate text-xs font-semibold text-surface-800 dark:text-surface-100">{file.filename}</p>
                    <p class="mt-0.5 font-mono text-[11px] text-surface-500 dark:text-surface-400">Current · {formatBytes(file.size)} · {new Date(file.updatedAt).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {#each file.versions || [] as ver}
                <div class="flex flex-col gap-3 rounded-lg border border-surface-200 bg-surface-50 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-surface-800 dark:bg-surface-900/60">
                  <div class="flex min-w-0 items-center gap-3">
                    <Badge variant="surface" size="sm">v{ver.versionNumber}</Badge>
                    <div class="min-w-0">
                      <p class="truncate text-xs font-semibold text-surface-800 dark:text-surface-100" title={ver.filename}>{ver.filename}</p>
                      <p class="mt-0.5 font-mono text-[11px] text-surface-500 dark:text-surface-400">
                        {formatBytes(ver.size)} · {new Date(ver.updatedAt).toLocaleString()}
                        {#if ver.updatedBy}
                          · {ver.updatedBy}
                        {/if}
                      </p>
                    </div>
                  </div>

                  <div class="flex shrink-0 gap-2 self-end sm:self-auto">
                    <Button
                      variant="ghost"
                      size="sm"
                      href={mediaUrl({ url: ver.path } as any)}
                      download={ver.filename}
                      title="Download version"
                      aria-label="Download version"
                      class="h-8 w-8 min-w-8 p-0!"
                    >
                      <iconify-icon icon="mdi:download-outline" width="14"></iconify-icon>
                    </Button>
                    <Button
                      variant="surface"
                      size="sm"
                      onclick={() => handleRestoreVersion(ver.versionNumber)}
                      disabled={isRestoringVersion}
                      aria-label="Restore version"
                      class="h-8 px-3"
                    >
                      Restore
                    </Button>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>

      {:else if activeTab === 'references'}
        <div in:fade={{ duration: 150 }} class="flex flex-col gap-4">
          {#if isScanningRefs}
            <div class="flex flex-col items-center justify-center gap-3 p-8">
              <iconify-icon icon="mdi:loading" class="animate-spin text-primary-500" width="28"></iconify-icon>
              <span class="text-xs text-surface-500 dark:text-surface-400">Scanning collections for usage references…</span>
            </div>
          {:else}
            <div>
              <h3 class="mb-1 text-sm font-semibold text-surface-800 dark:text-surface-100">Usage Scanner</h3>
              <p class="mb-4 text-xs text-surface-500 dark:text-surface-400">Lists all content entries where this media asset is referenced.</p>

              <div class="flex flex-col gap-2">
                {#each references as ref}
                  <div class="flex flex-col gap-3 rounded-lg border border-surface-200 bg-surface-50 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-surface-800 dark:bg-surface-900/60">
                    <div class="min-w-0">
                      <span class="text-[10px] font-semibold uppercase tracking-wide text-primary-500">{ref.collection}</span>
                      <p class="mt-0.5 text-xs font-medium text-surface-800 dark:text-surface-100">Field: <span class="font-mono">{ref.field}</span></p>
                      <p class="mt-0.5 font-mono text-[11px] text-surface-500 dark:text-surface-400">Entry ID: {ref.entryId}</p>
                    </div>

                    <Button
                      variant="surface"
                      size="sm"
                      href="/content/{ref.collection}/{ref.entryId}"
                      class="h-8 shrink-0 self-end px-3 sm:self-auto"
                    >
                      Go to Entry
                    </Button>
                  </div>
                {:else}
                  <div class="rounded-lg border border-dashed border-surface-200 p-6 text-center dark:border-surface-800">
                    <iconify-icon icon="mdi:link-variant-off" width="28" class="mb-2 text-surface-400"></iconify-icon>
                    <p class="text-xs text-surface-500 dark:text-surface-400">This asset is not referenced in any collections.</p>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>

      {:else if activeTab === 'share'}
        <div in:fade={{ duration: 150 }} class="flex flex-col gap-4">
          <div class="flex flex-col gap-3 rounded-lg border border-surface-200 bg-surface-50 p-4 dark:border-surface-800 dark:bg-surface-900/60">
            <h4 class="text-sm font-semibold text-surface-800 dark:text-surface-100">Create Expiring Public Link</h4>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select
                bind:value={expiryHoursValue}
                onchange={handleExpiryChange}
                label="Expiration"
                size="sm"
                placeholder="Select expiration…"
                options={[
                  { value: '1', label: '1 Hour' },
                  { value: '24', label: '24 Hours (1 Day)' },
                  { value: '168', label: '168 Hours (7 Days)' },
                  { value: 'never', label: 'Never Expires' }
                ]}
              />
              <Input
                type="password"
                bind:value={sharePassword}
                label="Password (optional)"
                inputClass="h-9 text-sm"
                placeholder="Set password…"
                aria-label="Share password"
              />
            </div>

            <Button
              variant="surface"
              size="sm"
              onclick={handleGenerateShareLink}
              disabled={isCreatingShare}
              aria-label="Generate sharing link"
              class="h-9 w-full gap-1.5"
            >
              {#if isCreatingShare}
                <iconify-icon icon="mdi:loading" class="animate-spin" width="16"></iconify-icon>
                <span>Generating…</span>
              {:else}
                <iconify-icon icon="mdi:link-variant" width="16"></iconify-icon>
                <span>Generate Sharing Link</span>
              {/if}
            </Button>
          </div>

          <div>
            <h3 class="mb-2 text-sm font-semibold text-surface-800 dark:text-surface-100">Active Sharing Links</h3>
            <div class="flex flex-col gap-2">
              {#each file.metadata?.sharedLinks || [] as link}
                {const expired = isExpired(link.expiry)}
                <div class="flex flex-col gap-2 rounded-lg border border-surface-200 bg-surface-50 p-3 dark:border-surface-800 dark:bg-surface-900/60">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <div class="flex items-center gap-2">
                      <span class="h-2 w-2 rounded-full {expired ? 'bg-error-500' : 'bg-success-500'}"></span>
                      <span class="font-mono text-[10px] uppercase text-surface-600 dark:text-surface-300">{expired ? 'Expired' : 'Active'}</span>
                      {#if link.passwordHash}
                        <iconify-icon icon="mdi:lock" width="14" class="text-warning-500" title="Password protected"></iconify-icon>
                      {/if}
                    </div>
                    <span class="font-mono text-[10px] text-surface-500 dark:text-surface-400">Downloads: {link.downloadCount || 0}</span>
                  </div>

                  <div class="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <Input
                      type="text"
                      value={getShareLinkUrl(link.token)}
                      readonly
                      label="Share URL"
                      inputClass="h-9 text-[11px] font-mono"
                      aria-label="Share link URL"
                      class="min-w-0 flex-1"
                    />
                    <div class="flex shrink-0 gap-2 self-stretch sm:self-auto">
                      <Button
                        variant="surface"
                        size="sm"
                        onclick={() => copyToClipboard(getShareLinkUrl(link.token))}
                        title="Copy share link"
                        aria-label="Copy share link"
                        class="h-9 flex-1 px-3 sm:flex-none"
                      >
                        Copy
                      </Button>
                      <Button
                        variant="error"
                        size="sm"
                        onclick={() => handleRevokeShareLink(link.token)}
                        title="Revoke share link"
                        aria-label="Revoke share link"
                        class="h-9 flex-1 px-3 sm:flex-none"
                      >
                        Revoke
                      </Button>
                    </div>
                  </div>

                  {#if link.expiry}
                    <div class="font-mono text-[10px] text-surface-500 dark:text-surface-400">
                      Expires: {new Date(link.expiry).toLocaleString()}
                    </div>
                  {/if}
                </div>
              {:else}
                <div class="py-4 text-center text-xs text-surface-500 dark:text-surface-400">No active share links.</div>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

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
</style>
