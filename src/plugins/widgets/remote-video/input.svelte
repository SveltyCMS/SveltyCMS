<!--
@file src/widgets/custom/RemoteVideo/Input.svelte
@component
**RemoteVideo Widget Input Component**

Provides URL input with automatic video metadata fetching and preview from multiple platforms.
Part of the Three Pillars Architecture for widget system.

@example
<RemoteVideoInput bind:value={videoData} field={{ allowedPlatforms: ["youtube", "vimeo"] }} />
<!-- User enters URL → fetches metadata → shows preview with thumbnail and details

### Props
- `field: FieldType` - Widget field definition with allowed platforms configuration
- `value: RemoteVideoData | null | undefined` - Video metadata object (bindable)
- `error?: string | null` - Validation error message for display

### Features
- **Multi-Platform Support**: YouTube, Vimeo, Twitch, TikTok integration
- **Automatic Metadata Fetching**: Debounced API calls for video information
- **Rich Preview**: Thumbnail, title, channel, and duration display
- **Security First**: Server-side metadata fetching with platform validation
- **Loading States**: Visual feedback during API requests with spinner
- **Error Handling**: Comprehensive error display for failed requests
- **URL Validation**: HTML5 URL input with platform-specific validation
- **Debounced Input**: Performance-optimized API calls (500ms delay)
- **Accessibility**: Full ARIA support with loading and error states
-->

<script lang="ts">
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { app, validationStore } from '@src/stores/store.svelte';
	import { logger } from '@utils/logger';
	import { debounce, getFieldName } from '@utils/utils';
	// Unified error handling
	import { handleWidgetValidation } from '@widgets/widget-error-handler';
	// Valibot validation
	import { custom, optional, parse, pipe, string, url } from 'valibot';
	import type { FieldType } from './';
	import type { RemoteVideoData } from './types';

	let {
		field,
		value = $bindable(),
		error
	}: {
		field: FieldType;
		value: RemoteVideoData | null | undefined | Record<string, RemoteVideoData>;
		error?: string | null;
	} = $props();

	const LANGUAGE = $derived(field.translated ? app.contentLanguage : ((publicEnv.DEFAULT_CONTENT_LANGUAGE as string) || 'en').toLowerCase());

	// Local state for the URL input.
	let urlInput = $state('');
	// Local state to temporarily hold fetched metadata before it's set to `value`.
	let fetchedMetadata = $state<RemoteVideoData | null>(null);
	let isLoading = $state(false);
	let fetchError = $state<string | null>(null);
	let isEditingManually = $state(false);

	// Props-driven features
	const allowManualEdit = $derived((field as any).defaults?.allowManualEdit ?? true);

	// Effect to update local `urlInput` when parent `value` changes externally.
	$effect(() => {
		const parentVal = value;
		let extracted: RemoteVideoData | null = null;

		if (field.translated && typeof parentVal === 'object' && parentVal !== null) {
			extracted = (parentVal as Record<string, any>)[LANGUAGE] ?? null;
		} else if (!field.translated && typeof parentVal === 'object') {
			extracted = parentVal as RemoteVideoData;
		}

		if (extracted?.url && extracted.url !== urlInput) {
			urlInput = extracted.url;
			fetchedMetadata = extracted;
		} else if (!extracted && urlInput !== '') {
			urlInput = '';
			fetchedMetadata = null;
			isEditingManually = false;
		}
	});

	// Platform Icons mapping
	const PLATFORM_ICONS: Record<string, string> = {
		youtube: 'logos:youtube-icon',
		vimeo: 'logos:vimeo-icon',
		twitch: 'logos:twitch',
		tiktok: 'logos:tiktok-icon',
		other: 'mdi:video'
	};

	const currentPlatform = $derived(fetchedMetadata?.platform || 'other');

	// Validation
	const fieldName = $derived(getFieldName(field));

	// Supported video platforms
	const supportedPlatforms = ['youtube.com', 'youtu.be', 'vimeo.com', 'twitch.tv', 'tiktok.com'];

	// Video URL validation schema
	const videoUrlSchema = $derived(
		field?.required
			? pipe(
					string(),
					url('Invalid URL format'),
					custom(
						(val) => supportedPlatforms.some((domain) => (val as string).includes(domain)),
						'Unsupported video platform. Supported: YouTube, Vimeo, Twitch, TikTok'
					)
				)
			: optional(
					pipe(
						string(),
						url('Invalid URL format'),
						custom(
							(val) => (val as string) === '' || supportedPlatforms.some((domain) => (val as string).includes(domain)),
							'Unsupported video platform'
						)
					),
					''
				)
	);

	// Validation function using unified handler
	function validateVideoUrl(urlValue: string): {
		valid: boolean;
		error?: string;
	} {
		if (!(urlValue || field?.required)) {
			validationStore.clearError(fieldName);
			return { valid: true };
		}
		const result = handleWidgetValidation(() => parse(videoUrlSchema, urlValue), {
			fieldName,
			updateStore: true
		});
		return { valid: result.valid, error: result.message ?? undefined };
	}

	// Helper to update parent value
	function updateParent(newData: RemoteVideoData | null) {
		if (field.translated) {
			if (!value || typeof value !== 'object') {
				value = {};
			}
			value = { ...(value as object), [LANGUAGE]: newData } as Record<string, RemoteVideoData>;
		} else {
			value = newData;
		}
	}

	function handleClear() {
		urlInput = '';
		fetchedMetadata = null;
		fetchError = null;
		isEditingManually = false;
		updateParent(null);
	}

	function toggleManualEdit() {
		if (!allowManualEdit) return;
		isEditingManually = !isEditingManually;
	}

	function updateMetadataField(key: keyof RemoteVideoData, val: string) {
		if (!fetchedMetadata) return;
		const updated = { ...fetchedMetadata, [key]: val };
		fetchedMetadata = updated;
		updateParent(updated);
	}

	// Debounced function to fetch video metadata from the server.
	const fetchVideoMetadata = debounce.create((...args: unknown[]) => {
		const url = typeof args[0] === 'string' ? args[0] : '';
		isLoading = true;
		fetchError = null;
		fetchedMetadata = null;

		if (!url) {
			isLoading = false;
			return;
		}

		// SECURITY: Validate URL before making API call
		const validation = validateVideoUrl(url);
		if (!validation.valid) {
			fetchError = validation.error || 'Invalid video URL';
			isLoading = false;
			updateParent(null);
			return;
		}

		// Async fetch wrapped in promise
		(async () => {
			try {
				// Call API endpoint to fetch metadata securely
				const response = await fetch('/api/remoteVideo', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					// Send a JSON object
					body: JSON.stringify({
						url,
						allowedPlatforms: field.allowedPlatforms
					})
				});

				const result = await response.json();

				if (response.ok && result.success) {
					fetchedMetadata = result.data;
					updateParent(result.data); // Bind the full metadata object back to the parent safely.
				} else {
					fetchError = result.error || 'Failed to fetch video metadata.';
					updateParent(null); // Clear parent value on error.
				}
			} catch (e) {
				logger.error('Error fetching video metadata:', e);
				fetchError = 'An unexpected error occurred while fetching video data.';
				updateParent(null);
			} finally {
				isLoading = false;
			}
		})();
	}, 500);

	// Trigger fetch when the URL input changes.
	function handleUrlInput() {
		fetchVideoMetadata(urlInput);
	}
</script>

<div class="input-container relative mb-4">
	<SystemTooltip title={error || fetchError || ''} wFull={true}>
		<div class="flex w-full overflow-hidden rounded border border-surface-400 dark:border-surface-600 bg-white dark:bg-surface-900" role="group">
			<!-- Platform Icon -->
			<div class="flex items-center px-3 border-r border-surface-400/30">
				<iconify-icon icon={PLATFORM_ICONS[currentPlatform]} width="20"></iconify-icon>
			</div>

			<input
				type="url"
				id={field.db_fieldName}
				name={field.db_fieldName}
				required={field.required}
				placeholder={typeof field.placeholder === 'string' ? field.placeholder : 'e.g., https://www.youtube.com/watch?v=dQw4w9WgXcQ'}
				bind:value={urlInput}
				oninput={handleUrlInput}
				oninvalid={(e) => e.preventDefault()}
				class="input w-full rounded-none border-none bg-transparent font-medium text-black outline-none focus:ring-0 dark:text-primary-500 {error ||
				fetchError
					? 'bg-error-500/10!'
					: ''} {isLoading ? 'opacity-50' : ''}"
				aria-invalid={!!error || !!fetchError}
				aria-describedby={error || fetchError ? `${field.db_fieldName}-error` : undefined}
			/>

			{#if isLoading}
				<div class="flex items-center px-3" aria-label="Loading">
					<div class="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"></div>
				</div>
			{/if}

			{#if urlInput && !isLoading}
				<button 
					type="button" 
					class="flex items-center px-3 text-surface-400 hover:text-error-500 transition-colors"
					onclick={handleClear}
					aria-label="Clear input"
				>
					<iconify-icon icon="mdi:close-circle" width="20"></iconify-icon>
				</button>
			{/if}
		</div>
	</SystemTooltip>

	{#if error || fetchError}
		<p id={`${field.db_fieldName}-error`} class="absolute -bottom-4 left-0 w-full text-center text-xs text-error-500" role="alert">
			{error || fetchError}
		</p>
	{/if}

	{#if fetchedMetadata && !isLoading && !fetchError}
		<div class="mt-4 flex flex-col gap-4 rounded-lg border border-surface-200 p-4 sm:flex-row sm:items-start dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/30">
			<div class="relative group shrink-0">
				<img src={fetchedMetadata.thumbnailUrl} alt={fetchedMetadata.title} class="h-auto w-full max-w-[160px] rounded shadow-sm object-cover aspect-video" />
				<div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded">
					<iconify-icon icon="mdi:play-circle" width="40" class="text-white"></iconify-icon>
				</div>
			</div>
			
			<div class="flex-1 space-y-2 min-w-0">
				<div class="flex items-start justify-between gap-2">
					{#if isEditingManually}
						<input 
							type="text" 
							class="input text-base font-bold p-1 bg-white dark:bg-surface-700 w-full"
							value={fetchedMetadata.title}
							oninput={(e) => updateMetadataField('title', e.currentTarget.value)}
						/>
					{:else}
						<h3 class="text-base font-bold text-surface-900 dark:text-surface-50 truncate">{fetchedMetadata.title}</h3>
					{/if}

					{#if allowManualEdit}
						<button 
							type="button" 
							class="btn btn-sm variant-soft-surface p-1"
							onclick={toggleManualEdit}
							title={isEditingManually ? 'Save' : 'Edit Metadata'}
						>
							<iconify-icon icon={isEditingManually ? 'mdi:check' : 'mdi:pencil'} width="16"></iconify-icon>
						</button>
					{/if}
				</div>

				{#if isEditingManually}
					<textarea 
						class="textarea text-xs p-1 bg-white dark:bg-surface-700 w-full"
						rows="2"
						value={fetchedMetadata.description || ''}
						oninput={(e) => updateMetadataField('description', e.currentTarget.value)}
						placeholder="Add description..."
					></textarea>
				{:else if fetchedMetadata.description}
					<p class="text-xs text-surface-600 dark:text-surface-400 line-clamp-2">{fetchedMetadata.description}</p>
				{/if}

				<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-surface-500 dark:text-surface-400">
					{#if fetchedMetadata.channelTitle}
						<span class="flex items-center gap-1">
							<iconify-icon icon="mdi:account" width="14"></iconify-icon>
							{fetchedMetadata.channelTitle}
						</span>
					{/if}
					{#if fetchedMetadata.duration}
						<span class="flex items-center gap-1">
							<iconify-icon icon="mdi:clock-outline" width="14"></iconify-icon>
							{fetchedMetadata.duration}
						</span>
					{/if}
				</div>

				<div class="flex items-center gap-3 pt-1">
					<a
						href={fetchedMetadata.url}
						target="_blank"
						rel="noopener noreferrer"
						class="btn btn-sm variant-soft-primary gap-1 text-xs"
					>
						<iconify-icon icon="mdi:open-in-new" width="14"></iconify-icon>
						Watch
					</a>
					<button 
						type="button"
						class="btn btn-sm variant-soft-surface gap-1 text-xs"
						onclick={() => fetchedMetadata && navigator.clipboard.writeText(fetchedMetadata.url)}
					>
						<iconify-icon icon="mdi:content-copy" width="14"></iconify-icon>
						Link
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.animate-spin {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
