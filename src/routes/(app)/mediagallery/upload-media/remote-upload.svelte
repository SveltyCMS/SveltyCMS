<!--
@file src/routes/(app)/mediagallery/upload-media/remote-upload.svelte
@component
**Remote URL upload into the media gallery**

### Features:
- Multi-line URL textarea
- Posts to upload-media page remoteUpload action
- CSRF token when available
-->

<script lang="ts">
	import { logger } from "@utils/logger";
	import { toast } from "@src/stores/toast.svelte.ts";
	import { page } from "$app/state";
	import Button from "@components/ui/button.svelte";

	interface Props {
		folder?: string;
		onUploadComplete?: () => void;
	}

	const { onUploadComplete, folder = "global" }: Props = $props();

	/** Raw textarea content (one URL per line) */
	let urlsText = $state("");
	let isUploading = $state(false);

	function parseUrls(text: string): string[] {
		return text
			.split("\n")
			.map((u) => u.trim())
			.filter((u) => u.length > 0 && /^https?:\/\//i.test(u));
	}

	async function uploadRemoteUrls() {
		const remoteUrls = parseUrls(urlsText);
		if (remoteUrls.length === 0) {
			toast.warning("Enter at least one valid http(s) URL (one per line)");
			return;
		}

		isUploading = true;
		const formData = new FormData();
		formData.append("remoteUrls", JSON.stringify(remoteUrls));
		formData.append("folder", folder);

		try {
			const headers: Record<string, string> = {};
			const csrf = (page.data as { csrfToken?: string })?.csrfToken;
			if (csrf) headers["X-CSRF-Token"] = csrf;

			// Actions live on this page route, not /mediagallery root
			const response = await fetch("/mediagallery/upload-media?/remoteUpload", {
				method: "POST",
				headers,
				body: formData,
			});

			if (!response.ok) {
				const errText = await response.text().catch(() => "");
				throw new Error(errText || `Upload failed (${response.status})`);
			}

			const result = await response.json().catch(() => ({}));
			// SvelteKit action responses: { type: 'success', data: ... } or { success: true }
			const ok =
				result?.type === "success" ||
				result?.success === true ||
				result?.data?.success === true;

			if (ok || response.ok) {
				toast.success("Remote URLs submitted");
				urlsText = "";
				onUploadComplete?.();
			} else {
				throw new Error(result?.error || result?.message || "Upload failed");
			}
		} catch (error) {
			logger.error("Error uploading URLs:", error);
			toast.error(
				`Error uploading URLs: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		} finally {
			isUploading = false;
		}
	}
</script>

<div class="space-y-4" data-testid="remote-upload-panel">
	<label
		id="remote-urls-label"
		for="remote-urls"
		class="block text-sm font-medium text-surface-700 dark:text-surface-200"
	>
		Remote image/media URLs
	</label>
	<textarea id="remote-urls" name="remote-urls" aria-label="Remote media URLs, one per line" data-testid="remote-urls-input" title="Remote media URLs" bind:value={urlsText} placeholder="Paste Remote URLs here, one per line (https://...)" rows="6" class="textarea w-full bg-secondary-50 dark:bg-secondary-800"></textarea>
	<p class="text-xs text-surface-500">
		Each line must be a public http(s) URL. Invalid lines are ignored.
	</p>
	<Button
		variant="tertiary"
		onclick={uploadRemoteUrls}
		disabled={isUploading}
		data-testid="remote-upload-submit"
		class="mt-2 dark:"
	>
		{isUploading ? "Uploading…" : "Upload URLs"}
	</Button>
</div>
