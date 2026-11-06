<!--
@file src/routes/(app)/mediagallery/upload-media/+page.svelte
@component
**Staged media upload queue (local files + remote URLs)**

The gallery toolbar's **Quick upload** posts straight into the current folder;
this page is the staged queue for larger batches. Both read the same
`?folderId=` so the files land where the user was browsing.

### Features
- Local queue (drag/drop, paste, per-file outcomes) and remote URL ingest
- Target-folder banner resolved server-side from `?folderId=`
- One redirect after success — the parent owns navigation
-->

<script lang="ts">
	import Tabs from '@components/ui/tabs';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import {
		uploadMedia_title,
		uploadMedia_local_upload,
		uploadMedia_remote_upload
	} from '@src/paraglide/messages';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import LocalUpload from './local-upload.svelte';
	import RemoteUpload from './remote-upload.svelte';

	let { data }: { data: PageData } = $props();

	let tabSet = $state('0');

	const folderId = $derived(data.folderId ?? '');
	/** Upload target: the browsed folder, or the media root. */
	const folder = $derived(folderId || 'global');
	const folderLabel = $derived(data.folderName ?? folderId ?? '');
	const galleryHref = $derived(
		folderId ? `/mediagallery?folderId=${encodeURIComponent(folderId)}` : '/mediagallery'
	);

	function handleUploadComplete() {
		// slop:suppress — post-action redirect after upload completes, not primary navigation
		goto(galleryHref);
	}
</script>

<AdminPageShell
	title={uploadMedia_title()}
	icon="bi:images"
	showBackButton={true}
	backUrl={galleryHref}
>
	<div class="wrapper" data-testid="upload-media-page">
		<p
			class="mb-2 flex items-center gap-1.5 text-xs text-(--admin-text-muted)"
			data-testid="upload-target-folder"
		>
			<iconify-icon icon={folderId ? 'mdi:folder' : 'mdi:folder-open'} width="14" aria-hidden="true"
			></iconify-icon>
			{#if folderId}
				<span>
					Uploading to
					<strong class="font-semibold text-(--admin-text-body)">{folderLabel}</strong>
				</span>
			{:else}
				<span>Uploading to the media root</span>
			{/if}
		</p>

		<Tabs bind:value={tabSet}>
			<Tabs.List {...{ 'data-testid': 'upload-media-tabs' }}>
				<Tabs.Trigger value="0" class="flex-1" data-testid="upload-tab-local">
					<iconify-icon icon="mdi:database" width="18" height="18" aria-hidden="true"
					></iconify-icon>
					{uploadMedia_local_upload()}
				</Tabs.Trigger>
				<Tabs.Trigger value="1" class="flex-1" data-testid="upload-tab-remote">
					<iconify-icon icon="mdi:radio" width="18" height="18" aria-hidden="true"></iconify-icon>
					{uploadMedia_remote_upload()}
				</Tabs.Trigger>

				<Tabs.Indicator />
			</Tabs.List>

			<Tabs.Content value="0"
				><div class="p-4">
					<LocalUpload {folder} onUploadComplete={handleUploadComplete} />
				</div></Tabs.Content
			>
			<Tabs.Content value="1"
				><div class="p-4">
					<RemoteUpload {folder} onUploadComplete={handleUploadComplete} />
				</div></Tabs.Content
			>
		</Tabs>
	</div>
</AdminPageShell>
