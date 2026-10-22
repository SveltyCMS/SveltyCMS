<!--
@file src/components/media/transcode-modal.svelte
@component
**Video transcoding form for the media details modal**

### Props
- `file` (object): The video asset (`_id`, `filename`, optional `metadata`).
- `onClose` (function): Called after the API accepts the job, or when the user cancels.

### Features:
- HLS (adaptive, multi-rendition) or a faststart MP4 output.
- Resolution allow-list and bitrate presets mapped to what
  `POST /api/media/transcode` accepts (`auto` or `<n>k`).
- Honest failure reporting: a missing `ffmpeg` (`503 FFMPEG_UNAVAILABLE`)
  is explained inline instead of being swallowed by a generic toast.
- Shows the job state already recorded on `metadata.transcode`.
-->

<script lang="ts">
	import { toast } from '@src/stores/toast.svelte.ts';
	import { logger } from '@utils/logger';
	import { clientJsonHeaders } from '@utils/security/client-csrf';
	import Button from '@components/ui/button.svelte';
	import Select from '@components/ui/select.svelte';
	import Badge from '@components/ui/badge.svelte';
	import {
		button_cancel,
		common_processing,
		mediagallery_hls_adaptive,
		mediagallery_mp4_fixed,
		mediagallery_output_format,
		mediagallery_resolutions,
		mediagallery_start_pipeline,
		mediagallery_transcode_hub
	} from '@src/paraglide/messages';

	interface TranscodeState {
		status?: string;
		format?: string;
		error?: string;
	}

	interface Props {
		file: {
			_id: string;
			filename: string;
			metadata?: { transcode?: TranscodeState | null } | null;
		};
		onClose: () => void;
	}

	let { file, onClose }: Props = $props();

	const AVAILABLE_RESOLUTIONS = ['1080p', '720p', '480p', '360p'] as const;
	type Resolution = (typeof AVAILABLE_RESOLUTIONS)[number];

	let format = $state<'hls' | 'mp4'>('hls');
	let resolutions = $state<Resolution[]>(['1080p', '720p', '480p']);
	let bitrate = $state('auto');
	let isSubmitting = $state(false);
	let errorMessage = $state('');

	const bitrateOptions = [
		{ value: 'auto', label: 'Auto-optimize' },
		{ value: '8000k', label: 'High (8 Mbps)' },
		{ value: '4000k', label: 'Medium (4 Mbps)' },
		{ value: '1500k', label: 'Low (1.5 Mbps)' }
	];

	const transcodeState = $derived(file.metadata?.transcode ?? null);

	function toggleResolution(resolution: Resolution) {
		resolutions = resolutions.includes(resolution)
			? resolutions.filter((current) => current !== resolution)
			: [...resolutions, resolution];
	}

	async function startTranscoding() {
		if (isSubmitting || resolutions.length === 0) return;

		isSubmitting = true;
		errorMessage = '';

		try {
			const response = await fetch('/api/media/transcode', {
				method: 'POST',
				headers: clientJsonHeaders(),
				body: JSON.stringify({
					mediaId: file._id,
					format,
					resolutions,
					bitrate
				})
			});

			const payload = (await response.json().catch(() => null)) as {
				success?: boolean;
				message?: string;
				code?: string;
			} | null;

			if (!response.ok || !payload?.success) {
				errorMessage =
					payload?.code === 'FFMPEG_UNAVAILABLE'
						? 'Transcoding requires ffmpeg on the server. Install ffmpeg or set FFMPEG_PATH, then retry.'
						: (payload?.message ?? `Transcoding failed to start (HTTP ${response.status}).`);
				return;
			}

			toast.success(`Transcoding started — ${file.filename} is queued.`);
			onClose();
		} catch (err) {
			logger.error('Transcode request failed', err);
			errorMessage = 'Transcoding failed to start. Check the server logs and retry.';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="space-y-5" data-testid="transcode-form">
	<header
		class="flex items-start justify-between gap-3 border-b border-(--admin-border-default) pb-3"
	>
		<div class="min-w-0">
			<h2 class="flex items-center gap-2 text-lg font-bold text-surface-900 dark:text-white">
				<iconify-icon icon="mdi:video-processing" width="22"></iconify-icon>
				{mediagallery_transcode_hub()}
			</h2>
			<p class="mt-0.5 truncate font-mono text-[11px] text-(--admin-text-muted)">{file.filename}</p>
		</div>
		{#if transcodeState?.status}
			<Badge
				variant={transcodeState.status === 'failed'
					? 'error'
					: transcodeState.status === 'processing'
						? 'warning'
						: 'success'}
				preset="tonal"
				size="sm"
				class="shrink-0 gap-1"
			>
				{#if transcodeState.status === 'processing'}
					<iconify-icon icon="mdi:loading" class="animate-spin" width="12"></iconify-icon>
				{/if}
				{transcodeState.status}
			</Badge>
		{/if}
	</header>

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<div class="space-y-2">
			<span class="block text-xs font-bold uppercase tracking-widest text-(--admin-text-muted)">
				{mediagallery_output_format()}
			</span>
			<div class="flex gap-2" role="group" aria-label={mediagallery_output_format()}>
				<Button
					variant={format === 'hls' ? 'primary' : 'surface'}
					class="flex-1"
					aria-pressed={format === 'hls'}
					onclick={() => (format = 'hls')}
					data-testid="transcode-format-hls"
				>
					{mediagallery_hls_adaptive()}
				</Button>
				<Button
					variant={format === 'mp4' ? 'primary' : 'surface'}
					class="flex-1"
					aria-pressed={format === 'mp4'}
					onclick={() => (format = 'mp4')}
					data-testid="transcode-format-mp4"
				>
					{mediagallery_mp4_fixed()}
				</Button>
			</div>
		</div>

		<div class="space-y-2">
			<Select
				id="target-bitrate"
				label="Target bitrate"
				bind:value={bitrate}
				options={bitrateOptions}
				placeholder=""
				data_testid="transcode-bitrate"
			/>
		</div>
	</div>

	<div class="space-y-2">
		<span class="block text-xs font-bold uppercase tracking-widest text-(--admin-text-muted)">
			{mediagallery_resolutions()}
		</span>
		<div class="flex flex-wrap gap-2" role="group" aria-label={mediagallery_resolutions()}>
			{#each AVAILABLE_RESOLUTIONS as resolution (resolution)}
				<Button
					variant={resolutions.includes(resolution) ? 'primary' : 'surface'}
					size="sm"
					class="px-4"
					aria-pressed={resolutions.includes(resolution)}
					onclick={() => toggleResolution(resolution)}
					data-testid={`transcode-resolution-${resolution}`}
				>
					{resolution}
				</Button>
			{/each}
		</div>
		<p class="text-xs text-(--admin-text-muted)">
			HLS writes one rendition per selected resolution; MP4 renders the highest one.
		</p>
	</div>

	{#if transcodeState?.status === 'failed' && transcodeState.error}
		<p class="rounded-lg border border-error-500/30 bg-error-500/10 p-3 text-xs text-error-500">
			{transcodeState.error}
		</p>
	{/if}

	{#if errorMessage}
		<p
			class="rounded-lg border border-error-500/30 bg-error-500/10 p-3 text-xs text-error-500"
			role="alert"
			data-testid="transcode-error"
		>
			{errorMessage}
		</p>
	{/if}

	<div
		class="flex flex-col-reverse gap-2 border-t border-(--admin-border-default) pt-4 sm:flex-row sm:justify-end"
	>
		<Button variant="surface" onclick={onClose} class="sm:min-w-28">{button_cancel()}</Button>
		<Button
			variant="primary"
			onclick={startTranscoding}
			disabled={isSubmitting || resolutions.length === 0}
			aria-busy={isSubmitting}
			class="gap-2 sm:min-w-44"
			data-testid="transcode-submit"
		>
			{#if isSubmitting}
				<iconify-icon icon="mdi:loading" width="18" class="animate-spin"></iconify-icon>
				{common_processing()}
			{:else}
				<iconify-icon icon="mdi:play" width="18"></iconify-icon>
				{mediagallery_start_pipeline()}
			{/if}
		</Button>
	</div>
</div>
