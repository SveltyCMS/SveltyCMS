<!-- 
@files src/routes/(app)/mediagallery/uploadMedia/+page.svelte
@component
**This page is used to upload media to the media gallery**
-->

<script lang="ts">
	import PageTitle from "@src/components/page-title.svelte";
	import { uploadMedia_title } from "@src/paraglide/messages";
	import { goto } from "$app/navigation";
	import LocalUpload from "./local-upload.svelte";
	import RemoteUpload from "./remote-upload.svelte";

	let tabSet = $state("0");

	function handleUploadComplete() {
		goto("/mediagallery");
	}

	function tabButtonClass(value: string) {
		return `flex-1 ${tabSet === value ? "border-b-2 border-primary-500 bg-surface-100 dark:bg-surface-800" : "border-b-2 border-transparent"}`;
	}
</script>

<div class="mb-4 flex items-center justify-between">
	<PageTitle name={uploadMedia_title()} icon="bi:images" iconColor="text-tertiary-500 dark:text-primary-500" />

	<button
		onclick={() => history.back()}
		aria-label="Back"
		class="preset-outlined-tertiary-500 btn-icon rounded-full dark:preset-outlined-primary-500"
	>
		<iconify-icon icon="mdi:arrow-left" width="24"></iconify-icon>
	</button>
</div>

<div class="wrapper">
	<div>
		<div class="flex border-b border-surface-200-800 font-bold" role="tablist" aria-label="Upload media tabs">
			<button
				type="button"
				role="tab"
				aria-selected={tabSet === "0"}
				class={tabButtonClass("0")}
				onclick={() => (tabSet = "0")}
			>
				<div class="flex items-center justify-center gap-2 py-4">
					<iconify-icon icon="mdi:database" width="24"></iconify-icon>
					<p class="text-tertiary-500 dark:text-primary-500">Local Upload</p>
				</div>
			</button>

			<button
				type="button"
				role="tab"
				aria-selected={tabSet === "1"}
				class={tabButtonClass("1")}
				onclick={() => (tabSet = "1")}
			>
				<div class="flex items-center justify-center gap-2 py-4">
					<iconify-icon icon="mdi:radio" width="24"></iconify-icon>
					<p class="text-tertiary-500 dark:text-primary-500">Remote Upload</p>
				</div>
			</button>
		</div>

		{#if tabSet === "0"}
			<div class="p-4" role="tabpanel">
				<LocalUpload onUploadComplete={handleUploadComplete} />
			</div>
		{/if}

		{#if tabSet === "1"}
			<div class="p-4" role="tabpanel">
				<RemoteUpload onUploadComplete={handleUploadComplete} />
			</div>
		{/if}
	</div>
</div>