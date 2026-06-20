<!-- 
@file src/routes/(app)/mediagallery/transcode-modal.svelte
@component Advanced Video Transcoding Interface
 -->
<script lang="ts">
import { toast } from "@src/stores/toast.svelte.ts";
import { logger } from "@utils/logger";
import { slide } from "svelte/transition";
	import Button from '@components/ui/button.svelte';

interface Props {
	video: { _id: string; filename: string; url: string };
	onClose: () => void;
}

let { video, onClose }: Props = $props();

let format = $state<"hls" | "mp4">("hls");
let resolutions = $state(["1080p", "720p", "480p"]);
let bitrate = $state("auto");
let isProcessing = $state(false);
let progress = $state(0);

const availableResolutions = ["1080p", "720p", "480p", "360p"];

async function startTranscoding() {
	isProcessing = true;
	progress = 0;

	try {
		const response = await fetch("/api/media/transcode", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				mediaId: video._id,
				format,
				resolutions,
				bitrate,
			}),
		});

		if (response.ok) {
			toast.success("Transcoding started. You will be notified when complete.");
			onClose();
		} else {
			throw new Error("Failed to start transcoding");
		}
	} catch (err) {
		logger.error("Transcode error", err);
		toast.error("Transcoding failed to start.");
	} finally {
		isProcessing = false;
	}
}

function toggleResolution(res: string) {
	if (resolutions.includes(res)) {
		resolutions = resolutions.filter((r) => r !== res);
	} else {
		resolutions = [...resolutions, res];
	}
}
</script>

<div class="p-6 space-y-6 bg-surface-50 dark:bg-surface-900 rounded-2xl max-w-xl mx-auto shadow-2xl border border-surface-200 dark:border-surface-800">
	<div class="flex items-center justify-between border-b border-surface-200 dark:border-surface-800 pb-4">
		<div>
			<h2 class="text-xl font-bold text-tertiary-500 dark:text-primary-500 flex items-center gap-2">
				<iconify-icon icon="mdi:video-processing" width="24"></iconify-icon>
				Video Transcoding Hub
			</h2>
			<p class="text-xs opacity-50 font-mono mt-1">{video.filename}</p>
		</div>
		<Button variant="surface" onclick={onClose} aria-label="Close" class="p-0! min-w-0">
			<iconify-icon icon="mdi:close" width="20"></iconify-icon>
		</Button>
	</div>

	<div class="grid grid-cols-2 gap-6">
		<!-- Output Format -->
		<div class="space-y-2">
			<span class="block text-sm font-bold uppercase tracking-widest opacity-60">Output Format</span>
			<div class="flex gap-2">
				<Button variant="tertiary"
					onclick={() => format = 'hls'}
				 class="flex-1 {format === 'hls' ? ' dark: ' : ' '}">
					HLS (Adaptive)
				</Button>
				<Button variant="tertiary"
					onclick={() => format = 'mp4'}
				 class="flex-1 {format === 'mp4' ? ' dark: ' : ' '}">
					MP4 (Fixed)
				</Button>
			</div>
		</div>

		<!-- Bitrate -->
		<div class="space-y-2">
			<label for="target-bitrate" class="label text-sm font-bold uppercase tracking-widest opacity-60">Target Bitrate</label>
			<select id="target-bitrate" bind:value={bitrate} class="select">
				<option value="auto">Auto-Optimize</option>
				<option value="high">High (8Mbps)</option>
				<option value="medium">Medium (4Mbps)</option>
				<option value="low">Low (1.5Mbps)</option>
			</select>
		</div>
	</div>

	<!-- Resolutions -->
	<div class="space-y-3">
		<span class="block text-sm font-bold uppercase tracking-widest opacity-60">Resolutions to Generate</span>
		<div class="flex flex-wrap gap-2">
			{#each availableResolutions as res}
				<Button variant="secondary"
					onclick={() => toggleResolution(res)}
				 size="sm" class="px-4 {resolutions.includes(res) ? ' ' : ' '}">
					{res}
				</Button>
			{/each}
		</div>
	</div>

	<!-- Processing View -->
	{#if isProcessing}
		<div class="space-y-2 py-4" transition:slide>
			<div class="flex justify-between text-xs font-mono">
				<span>Processing...</span>
				<span>{progress}%</span>
			</div>
			<div class="h-2 w-full bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden">
				<div class="h-full bg-tertiary-500 dark:bg-primary-500 transition-all duration-500" style:width="{progress}%"></div>
			</div>
		</div>
	{/if}

	<div class="flex gap-3 pt-4">
		<Button variant="surface" onclick={onClose} class="flex-1">Cancel</Button>
		<Button variant="tertiary" 
			onclick={startTranscoding}
			disabled={isProcessing || resolutions.length === 0}
		 class="dark: flex-1 gap-2">
			{#if isProcessing}
				<iconify-icon icon="mdi:loading" width="20" class="animate-spin"></iconify-icon>
			{:else}
				<iconify-icon icon="mdi:play" width="20"></iconify-icon>
			{/if}
			Start Pipeline
		</Button>
	</div>
</div>
