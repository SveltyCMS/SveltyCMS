<!--
@file src/routes/(app)/mediagallery/advanced-search-modal.svelte
@component
**Advanced Search Modal for Media Gallery**

Provides comprehensive search interface with multiple criteria:
- File properties (name, size, type)
- Dimensions (width, height, aspect ratio)
- Dates (upload range)
- EXIF metadata
- Duplicate detection

Structure optimized for LLM integration and AI-powered search.

### Props
- `files: MediaBase[]` - All available media files
- `onSearch: (criteria: SearchCriteria) => void` - Callback with search results
- `onClose: () => void` - Callback to close modal

### Features
- Multi-criteria form
- Search suggestions (tags, cameras, common dimensions)
- Real-time validation
- Keyboard shortcuts (Enter to search, Escape to close)
- Accessible form controls
-->

<script lang="ts">
	import type { SearchCriteria } from '@utils/media/advanced-search';
	import type { MediaBase } from '@utils/media/media-models';
	import { SvelteDate, SvelteSet } from 'svelte/reactivity';
	import AdminCard from '@components/admin-card.svelte';
	import Button from '@components/ui/button.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
	import {
		button_cancel,
		button_reset,
		common_advanced,
		MediaGallery_Search,
		mediagallery_advanced_search,
		mediagallery_aspect_ratio,
		mediagallery_basic_criteria,
		mediagallery_camera_placeholder,
		mediagallery_common_dimensions,
		mediagallery_ctrl_enter,
		mediagallery_dimensions,
		mediagallery_exif_placeholder,
		mediagallery_filename_placeholder,
		mediagallery_file_properties,
		mediagallery_found,
		mediagallery_id_placeholder,
		mediagallery_large_5mb,
		mediagallery_location_placeholder,
		mediagallery_metadata_exif,
		mediagallery_mime_placeholder,
		mediagallery_press,
		mediagallery_recent_7d,
		mediagallery_recent_30d,
		mediagallery_suggestions,
		mediagallery_tags_placeholder,
		mediagallery_tip,
		mediagallery_to_search,
		mediagallery_upload_dates,
		mediagallery_4k_images
	} from '@src/paraglide/messages';

	interface Props {
		files: MediaBase[];
		onClose: () => void;
		onSearch: (criteria: SearchCriteria) => void;
	}

	const { files, onSearch, onClose }: Props = $props();

	const aspectRatioOptions = [
		{ value: 'any', label: 'Any' },
		{ value: 'landscape', label: 'Landscape' },
		{ value: 'portrait', label: 'Portrait' },
		{ value: 'square', label: 'Square' }
	];

	const hasExifOptions = [
		{ value: 'any', label: 'Any' },
		{ value: 'yes', label: 'Yes' },
		{ value: 'no', label: 'No' }
	];

	// Form input values (separate from criteria for easier binding)
	let formValues = $state({
		filename: '',
		tagsInput: '',
		minWidth: '',
		maxWidth: '',
		minHeight: '',
		maxHeight: '',
		aspectRatio: 'any',
		minSize: '',
		maxSize: '',
		fileTypesInput: '',
		uploadedAfter: '',
		uploadedBefore: '',
		hasEXIF: 'any',
		camera: '',
		location: '',
		dominantColor: '',
		showDuplicatesOnly: false,
		hashMatch: ''
	});

	// Search suggestions (computed from files)
	const suggestions = $derived.by(() => {
		const tags = new SvelteSet<string>();
		const cameras = new SvelteSet<string>();
		const dimensions = new SvelteSet<string>();

		files.forEach((file) => {
			if (file.metadata && typeof file.metadata === 'object' && 'tags' in file.metadata) {
				const fileTags = file.metadata.tags as string[] | undefined;
				if (Array.isArray(fileTags)) {
					fileTags.forEach((tag) => tags.add(tag));
				}
			}

			if (file.metadata && typeof file.metadata === 'object' && 'exif' in file.metadata) {
				const exif = file.metadata.exif as Record<string, unknown> | undefined;
				if (exif && 'camera' in exif && typeof exif.camera === 'string') {
					cameras.add(exif.camera);
				}
			}

			const imageFile = file as { width?: number; height?: number };
			if (imageFile.width && imageFile.height) {
				dimensions.add(`${imageFile.width}x${imageFile.height}`);
			}
		});

		return {
			tags: Array.from(tags).slice(0, 10),
			cameras: Array.from(cameras).slice(0, 10),
			dimensions: Array.from(dimensions).slice(0, 10)
		};
	});

	function handleSearch() {
		const searchCriteria: SearchCriteria = {
			filename: formValues.filename || undefined,
			tags: formValues.tagsInput ? formValues.tagsInput.split(',').map((t) => t.trim()) : undefined,
			minWidth: formValues.minWidth ? Number.parseInt(formValues.minWidth, 10) : undefined,
			maxWidth: formValues.maxWidth ? Number.parseInt(formValues.maxWidth, 10) : undefined,
			minHeight: formValues.minHeight ? Number.parseInt(formValues.minHeight, 10) : undefined,
			maxHeight: formValues.maxHeight ? Number.parseInt(formValues.maxHeight, 10) : undefined,
			aspectRatio:
				formValues.aspectRatio !== 'any'
					? (formValues.aspectRatio as 'landscape' | 'portrait' | 'square')
					: undefined,
			minSize: formValues.minSize
				? Number.parseInt(formValues.minSize, 10) * 1024 * 1024
				: undefined,
			maxSize: formValues.maxSize
				? Number.parseInt(formValues.maxSize, 10) * 1024 * 1024
				: undefined,
			fileTypes: formValues.fileTypesInput
				? formValues.fileTypesInput.split(',').map((t) => t.trim())
				: undefined,
			uploadedAfter: formValues.uploadedAfter ? new Date(formValues.uploadedAfter) : undefined,
			uploadedBefore: formValues.uploadedBefore ? new Date(formValues.uploadedBefore) : undefined,
			hasEXIF: formValues.hasEXIF !== 'any' ? formValues.hasEXIF === 'yes' : undefined,
			camera: formValues.camera || undefined,
			location: formValues.location || undefined,
			dominantColor: formValues.dominantColor || undefined,
			showDuplicatesOnly: formValues.showDuplicatesOnly,
			hashMatch: formValues.hashMatch || undefined
		};

		onSearch(searchCriteria);
	}

	function resetForm() {
		formValues = {
			filename: '',
			tagsInput: '',
			minWidth: '',
			maxWidth: '',
			minHeight: '',
			maxHeight: '',
			aspectRatio: 'any',
			minSize: '',
			maxSize: '',
			fileTypesInput: '',
			uploadedAfter: '',
			uploadedBefore: '',
			hasEXIF: 'any',
			camera: '',
			location: '',
			dominantColor: '',
			showDuplicatesOnly: false,
			hashMatch: ''
		};
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		} else if (e.key === 'Enter' && e.ctrlKey) {
			handleSearch();
		}
	}
</script>

<!-- Modal Content Wrapper -->
<div class="flex h-full w-full flex-col items-center justify-center p-4">
	<AdminCard
		class="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden border border-surface-500/30 bg-surface-500/10 shadow-xl dark:border-surface-500/40 dark:bg-surface-800"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => {
			if (e.key === 'Enter') e.stopPropagation();
			handleKeydown(e);
		}}
		role="dialog"
		aria-modal="true"
		aria-labelledby="advanced-search-title"
		tabindex={0}
	>
		<!-- Header -->
		<div
			class="flex-none border-b border-surface-500/30 bg-surface-200/50 p-4 dark:border-surface-600 dark:bg-surface-700/50"
		>
			<h2
				id="advanced-search-title"
				class="text-center text-2xl font-bold text-tertiary-500 underline dark:text-primary-500"
			>
				{mediagallery_advanced_search()}
			</h2>
		</div>

		<!-- Scrollable Body -->
		<div class="flex-1 overflow-y-auto p-6">
			<form
				id="advanced-search-form"
				onsubmit={(e) => {
					e.preventDefault();
					handleSearch();
				}}
				class="space-y-6"
			>
				<!-- Search Presets -->
				<div class="flex flex-wrap gap-2">
					<Button
						variant="outline"
						type="button"
						class="chip preset-outlined-tertiary-500 dark:preset-outlined-primary-500 hover:preset-filled-tertiary-500 dark:preset-filled-primary-500 transition-colors"
						onclick={() => {
							const date = new SvelteDate();
							date.setDate(date.getDate() - 7);
							formValues.uploadedAfter = date.toISOString().split('T')[0];
							formValues.uploadedBefore = '';
						}}
					>
						<iconify-icon icon="mdi:calendar-week" width={24}></iconify-icon>
						<span>{mediagallery_recent_7d()}</span>
					</Button>
					<Button
						variant="outline"
						type="button"
						class="chip preset-outlined-tertiary-500 dark:preset-outlined-primary-500 hover:preset-filled-tertiary-500 dark:preset-filled-primary-500 transition-colors"
						onclick={() => {
							const date = new SvelteDate();
							date.setDate(date.getDate() - 30);
							formValues.uploadedAfter = date.toISOString().split('T')[0];
							formValues.uploadedBefore = '';
						}}
					>
						<iconify-icon icon="mdi:calendar-month" width={24}></iconify-icon>
						<span>{mediagallery_recent_30d()}</span>
					</Button>
					<Button
						variant="outline"
						type="button"
						class="chip preset-outlined-tertiary-500 dark:preset-outlined-primary-500 hover:preset-filled-tertiary-500 dark:preset-filled-primary-500 transition-colors"
						onclick={() => {
							formValues.minSize = '5';
							formValues.maxSize = '';
						}}
					>
						<iconify-icon icon="mdi:file-star" width={24}></iconify-icon>
						<span>{mediagallery_large_5mb()}</span>
					</Button>
					<Button
						variant="outline"
						type="button"
						class="chip preset-outlined-tertiary-500 dark:preset-outlined-primary-500 hover:preset-filled-tertiary-500 dark:preset-filled-primary-500 transition-colors"
						onclick={() => {
							formValues.minWidth = '3840';
							formValues.minHeight = '2160';
						}}
					>
						<iconify-icon icon="mdi:monitor-screenshot" width={24}></iconify-icon>
						<span>{mediagallery_4k_images()}</span>
					</Button>
				</div>

				<hr class="border-surface-500/30 dark:border-surface-600" />

				<!-- Basic Search -->
				<section>
					<h3 class="mb-3 text-lg font-semibold text-tertiary-500 dark:text-primary-500">
						{mediagallery_basic_criteria()}
					</h3>
					<div class="grid gap-4 md:grid-cols-2">
						<Input
							bind:value={formValues.filename}
							label="Filename"
							placeholder={mediagallery_filename_placeholder()}
						/>
						<div>
							<Input
								bind:value={formValues.tagsInput}
								label="Tags (comma-separated)"
								placeholder={mediagallery_tags_placeholder()}
							/>
							{#if suggestions.tags.length > 0}
								<div class="mt-1 text-xs text-surface-600 dark:text-surface-50">
									{mediagallery_suggestions()}
									{suggestions.tags.join(', ')}
								</div>
							{/if}
						</div>
					</div>
				</section>

				<!-- Dimensions -->
				<section>
					<h3 class="mb-3 text-lg font-semibold text-tertiary-500 dark:text-primary-500">
						{mediagallery_dimensions()}
					</h3>
					<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
						<Input
							bind:value={formValues.minWidth}
							type="number"
							label="Min Width (px)"
							placeholder="1920"
						/>
						<Input
							bind:value={formValues.maxWidth}
							type="number"
							label="Max Width (px)"
							placeholder="3840"
						/>
						<Input
							bind:value={formValues.minHeight}
							type="number"
							label="Min Height (px)"
							placeholder="1080"
						/>
						<Input
							bind:value={formValues.maxHeight}
							type="number"
							label="Max Height (px)"
							placeholder="2160"
						/>
					</div>

					<div class="mt-4">
						<Select
							bind:value={formValues.aspectRatio}
							label="Aspect Ratio"
							options={aspectRatioOptions}
							placeholder={mediagallery_aspect_ratio()}
						/>
					</div>

					{#if suggestions.dimensions.length > 0}
						<div class="mt-2 text-xs text-surface-600 dark:text-surface-50">
							{mediagallery_common_dimensions()}
							{suggestions.dimensions.join(', ')}
						</div>
					{/if}
				</section>

				<!-- File Properties -->
				<section>
					<h3 class="mb-3 text-lg font-semibold text-tertiary-500 dark:text-primary-500">
						{mediagallery_file_properties()}
					</h3>
					<div class="grid gap-4 md:grid-cols-3">
						<Input
							bind:value={formValues.minSize}
							type="number"
							label="Min Size (MB)"
							placeholder="1"
							step="0.1"
						/>
						<Input
							bind:value={formValues.maxSize}
							type="number"
							label="Max Size (MB)"
							placeholder="50"
							step="0.1"
						/>
						<Input
							bind:value={formValues.fileTypesInput}
							label="File Types"
							placeholder={mediagallery_mime_placeholder()}
						/>
					</div>
				</section>

				<!-- Dates -->
				<section>
					<h3 class="mb-3 text-lg font-semibold text-tertiary-500 dark:text-primary-500">
						{mediagallery_upload_dates()}
					</h3>
					<div class="grid gap-4 md:grid-cols-2">
						<Input bind:value={formValues.uploadedAfter} type="date" label="Uploaded After" />
						<Input bind:value={formValues.uploadedBefore} type="date" label="Uploaded Before" />
					</div>
				</section>

				<!-- EXIF & Metadata -->
				<section>
					<h3 class="mb-3 text-lg font-semibold text-tertiary-500 dark:text-primary-500">
						{mediagallery_metadata_exif()}
					</h3>
					<div class="grid gap-4 md:grid-cols-3">
						<Select
							bind:value={formValues.hasEXIF}
							label="Has EXIF Data"
							options={hasExifOptions}
							placeholder={mediagallery_exif_placeholder()}
						/>
						<div>
							<Input
								bind:value={formValues.camera}
								label="Camera"
								placeholder={mediagallery_camera_placeholder()}
							/>
							{#if suggestions.cameras.length > 0}
								<div class="mt-1 text-xs text-surface-600 dark:text-surface-50">
									{mediagallery_found()}
									{suggestions.cameras.join(', ')}
								</div>
							{/if}
						</div>
						<Input
							bind:value={formValues.location}
							label="Location"
							placeholder={mediagallery_location_placeholder()}
						/>
					</div>
				</section>

				<!-- Advanced -->
				<section>
					<h3 class="mb-3 text-lg font-semibold text-tertiary-500 dark:text-primary-500">
						{common_advanced()}
					</h3>
					<div class="grid gap-4 md:grid-cols-2">
						<Input
							bind:value={formValues.dominantColor}
							label="Dominant Color (hex)"
							placeholder="#FF5733"
						/>
						<Input
							bind:value={formValues.hashMatch}
							label="Hash Match"
							placeholder={mediagallery_id_placeholder()}
						/>
					</div>

					<div class="mt-4">
						<Checkbox bind:checked={formValues.showDuplicatesOnly} label="Show Duplicates Only" />
					</div>
				</section>
			</form>
		</div>

		<!-- Footer -->
		<div
			class="flex-none border-t border-surface-500/30 bg-surface-200/50 p-4 dark:border-surface-600 dark:bg-surface-700/50"
		>
			<div class="flex items-center justify-between">
				<div class="hidden text-sm sm:block">
					<strong class="text-tertiary-500 dark:text-primary-500">{mediagallery_tip()}</strong>
					{mediagallery_press()}
					<kbd class="badge preset-filled-tertiary-500 dark:preset-filled-primary-500"
						>{mediagallery_ctrl_enter()}</kbd
					>
					{mediagallery_to_search()}
				</div>

				<div class="ms-auto flex gap-3">
					<Button variant="outline" type="button" onclick={resetForm}>{button_reset()}</Button>
					<Button variant="outline" type="button" onclick={onClose}>{button_cancel()}</Button>
					<Button variant="tertiary" type="submit" form="advanced-search-form">
						<iconify-icon icon="mdi:magnify" width={20}></iconify-icon>
						{MediaGallery_Search()}
					</Button>
				</div>
			</div>
		</div>
	</AdminCard>
</div>
