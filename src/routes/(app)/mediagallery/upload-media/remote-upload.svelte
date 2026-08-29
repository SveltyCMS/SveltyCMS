<!--
@file src/routes/(app)/mediagallery/upload-media/remote-upload.svelte
@component
**Remote URL upload into the media gallery**

### Features:
- Multi-line URL textarea
- Calls the uploadRemoteUrls remote (MediaService, no extra form-action hop)
- CSRF token when available
-->

<script lang="ts">
	import { logger } from "@utils/logger";
	import { toast } from "@src/stores/toast.svelte.ts";
	import Button from "@components/ui/button.svelte";
	import { uploadRemoteUrls as uploadRemoteUrlsRemote } from "./remote-upload.remote";

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
		try {
			const result = await uploadRemoteUrlsRemote({ urls: remoteUrls, folder });
			if (result.success) {
				toast.success("Remote URLs submitted");
				urlsText = "";
				onUploadComplete?.();
			} else {
				throw new Error(result.error || "Upload failed");
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
		class="block text-sm font-medium text-surface-600 dark:text-surface-400"
	>
		Remote image/media URLs
	</label>
	<textarea id="remote-urls" name="remote-urls" aria-label="Remote media URLs, one per line" data-testid="remote-urls-input" title="Remote media URLs" bind:value={urlsText} placeholder="Paste Remote URLs here, one per line (https://...)" rows="6" class="textarea w-full bg-secondary-500/10 dark:bg-secondary-800"></textarea>
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
