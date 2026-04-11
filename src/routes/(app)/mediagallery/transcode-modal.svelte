<!-- 
@file src/routes/(app)/mediagallery/transcode-modal.svelte
@component Advanced Video Transcoding Interface
 -->
<script lang="ts">
import { toast } from "@src/stores/toast.svelte.ts";
import { logger } from "@utils/logger";
import { slide } from "svelte/transition";

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
			<h2 class="text-xl font-bold text-primary-500 flex items-center gap-2">
				<iconify-icon icon="mdi:video-processing" width="24"></iconify-icon>
				Video Transcoding Hub
			</h2>
			<p class="text-xs opacity-50 font-mono mt-1">{video.filename}</p>
		</div>
		<button class="btn-icon preset-tonal-surface" onclick={onClose} aria-label="Close">
			<iconify-icon icon="mdi:close" width="20"></iconify-icon>
		</button>
	</div>

	<div class="grid grid-cols-2 gap-6">
		<!-- Output Format -->
		<div class="space-y-2">
			<span class="block text-sm font-bold uppercase tracking-widest opacity-60">Output Format</span>
			<div class="flex gap-2">
				<button 
					class="btn flex-1 {format === 'hls' ? 'preset-filled-primary-500' : 'preset-tonal-surface'}"
					onclick={() => format = 'hls'}
				>
					HLS (Adaptive)
				</button>
				<button 
					class="btn flex-1 {format === 'mp4' ? 'preset-filled-primary-500' : 'preset-tonal-surface'}"
					onclick={() => format = 'mp4'}
				>
					MP4 (Fixed)
				</button>
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
				<button 
					class="btn btn-sm px-4 {resolutions.includes(res) ? 'preset-filled-secondary-500' : 'preset-outlined-surface-500'}"
					onclick={() => toggleResolution(res)}
				>
					{res}
				</button>
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
				<div class="h-full bg-primary-500 transition-all duration-500" style:width="{progress}%"></div>
			</div>
		</div>
	{/if}

	<div class="flex gap-3 pt-4">
		<button class="btn preset-tonal-surface flex-1" onclick={onClose}>Cancel</button>
		<button 
			class="btn preset-filled-primary-500 flex-1 gap-2" 
			onclick={startTranscoding}
			disabled={isProcessing || resolutions.length === 0}
		>
			{#if isProcessing}
				<iconify-icon icon="mdi:loading" width="20" class="animate-spin"></iconify-icon>
			{:else}
				<iconify-icon icon="mdi:play" width="20"></iconify-icon>
			{/if}
			Start Pipeline
		</button>
	</div>
</div>
