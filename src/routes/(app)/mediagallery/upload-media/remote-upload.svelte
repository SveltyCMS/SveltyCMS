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
	import { logger } from '@utils/logger';
	import { toast } from '@src/stores/toast.svelte.ts';
	import Button from '@components/ui/button.svelte';
	import Textarea from '@components/ui/textarea.svelte';
	import {
		mediagallery_remote_aria,
		mediagallery_remote_hint,
		mediagallery_remote_placeholder,
		mediagallery_remote_title
	} from '@src/paraglide/messages';
	import { uploadRemoteUrls as uploadRemoteUrlsRemote } from './remote-upload.remote';

	interface Props {
		folder?: string;
		onUploadComplete?: () => void;
	}

	const { onUploadComplete, folder = 'global' }: Props = $props();

	/** Raw textarea content (one URL per line) */
	let urlsText = $state('');
	let isUploading = $state(false);

	function parseUrls(text: string): string[] {
		return text
			.split('\n')
			.map((u) => u.trim())
			.filter((u) => u.length > 0 && /^https?:\/\//i.test(u));
	}

	const parsedUrls = $derived(parseUrls(urlsText));
	const ignoredLines = $derived(
		urlsText.split('\n').filter((line) => line.trim().length > 0).length - parsedUrls.length
	);

	async function uploadRemoteUrls() {
		const remoteUrls = parsedUrls;
		if (remoteUrls.length === 0) {
			toast.warning('Enter at least one valid http(s) URL (one per line)');
			return;
		}

		isUploading = true;
		try {
			const result = await uploadRemoteUrlsRemote({ urls: remoteUrls, folder });
			if (result.success) {
				const processed = result.processed ?? remoteUrls.length;
				const failed = result.failed ?? 0;
				if (failed > 0) {
					const details = (result.errors ?? [])
						.slice(0, 3)
						.map((entry) => entry.message)
						.join('; ');
					toast.warning(
						`Imported ${processed} of ${processed + failed} URLs${details ? ` — ${details}` : ''}`
					);
					// Keep the text so the user can retry the URLs that failed.
					return;
				}

				toast.success(
					processed === 1 ? 'Imported 1 remote URL' : `Imported ${processed} remote URLs`
				);
				urlsText = '';
				onUploadComplete?.();
			} else {
				throw new Error(result.error || 'Upload failed');
			}
		} catch (error) {
			logger.error('Error uploading URLs:', error);
			toast.error(
				`Error uploading URLs: ${error instanceof Error ? error.message : 'Unknown error'}`
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
		class="block text-sm font-medium text-(--admin-text-muted)"
	>
		{mediagallery_remote_title()}
	</label>
	<!-- Native Textarea keeps the route's field id/label wiring and the theme's input token -->
	<Textarea
		id="remote-urls"
		name="remote-urls"
		aria-label={mediagallery_remote_aria()}
		data-testid="remote-urls-input"
		title={mediagallery_remote_title()}
		bind:value={urlsText}
		placeholder={mediagallery_remote_placeholder()}
		rows={6}
	/>
	<p class="text-xs text-(--admin-text-muted)">
		{mediagallery_remote_hint()}
	</p>
	<p class="text-xs text-(--admin-text-muted)" aria-live="polite" data-testid="remote-url-count">
		{parsedUrls.length}
		{parsedUrls.length === 1 ? 'valid URL' : 'valid URLs'} ready{#if ignoredLines > 0}
			· {ignoredLines} ignored{/if}
	</p>
	<Button
		variant="tertiary"
		onclick={uploadRemoteUrls}
		disabled={isUploading}
		data-testid="remote-upload-submit"
		class="mt-2"
	>
		{isUploading ? 'Uploading…' : 'Upload URLs'}
	</Button>
</div>
