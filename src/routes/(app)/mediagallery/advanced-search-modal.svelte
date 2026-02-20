<!--
@file src/routes/(app)/mediagallery/AdvancedSearchModal.svelte
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
	import { SvelteSet } from 'svelte/reactivity';

	interface Props {
		files: MediaBase[];
		onClose: () => void;
		onSearch: (criteria: SearchCriteria) => void;
	}

	const { files, onSearch, onClose }: Props = $props();

	// Search criteria state (not used directly, converted from formValues)
	// let criteria = $state<SearchCriteria>({...});

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
			// Extract tags - handle type safety
			if (file.metadata && typeof file.metadata === 'object' && 'tags' in file.metadata) {
				const fileTags = file.metadata.tags as string[] | undefined;
				if (Array.isArray(fileTags)) {
					fileTags.forEach((tag) => tags.add(tag));
				}
			}

			// Extract camera info - handle type safety
			if (file.metadata && typeof file.metadata === 'object' && 'exif' in file.metadata) {
				const exif = file.metadata.exif as Record<string, unknown> | undefined;
				if (exif && 'camera' in exif && typeof exif.camera === 'string') {
					cameras.add(exif.camera);
				}
			}

			// Extract common dimensions - use MediaImage type
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

	// Handle search
	function handleSearch() {
		// Convert form values to criteria
		const searchCriteria: SearchCriteria = {
			filename: formValues.filename || undefined,
			tags: formValues.tagsInput ? formValues.tagsInput.split(',').map((t) => t.trim()) : undefined,
			minWidth: formValues.minWidth ? Number.parseInt(formValues.minWidth, 10) : undefined,
			maxWidth: formValues.maxWidth ? Number.parseInt(formValues.maxWidth, 10) : undefined,
			minHeight: formValues.minHeight ? Number.parseInt(formValues.minHeight, 10) : undefined,
			maxHeight: formValues.maxHeight ? Number.parseInt(formValues.maxHeight, 10) : undefined,
			aspectRatio: formValues.aspectRatio !== 'any' ? (formValues.aspectRatio as 'landscape' | 'portrait' | 'square') : undefined,
			minSize: formValues.minSize ? Number.parseInt(formValues.minSize, 10) * 1024 * 1024 : undefined, // Convert MB to bytes
			maxSize: formValues.maxSize ? Number.parseInt(formValues.maxSize, 10) * 1024 * 1024 : undefined,
			fileTypes: formValues.fileTypesInput ? formValues.fileTypesInput.split(',').map((t) => t.trim()) : undefined,
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

	// Reset form
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

	// Keyboard shortcuts
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		} else if (e.key === 'Enter' && e.ctrlKey) {
			handleSearch();
		}
	}
</script>

<!-- Modal Content Wrapper -->
<div class="h-full w-full flex flex-col items-center justify-center p-4">
	<div
		class="card max-h-[85vh] w-full max-w-4xl flex flex-col overflow-hidden bg-surface-100 dark:bg-surface-800 shadow-xl"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => {
			if (e.key === 'Enter') e.stopPropagation();
			handleKeydown(e);
		}}
		role="dialog"
		aria-modal="true"
		aria-labelledby="advanced-search-title"
		tabindex="0"
	>
		<!-- Header -->
		<div class="flex-none border-b border-surface-300 p-4 dark:border-surface-600 bg-surface-200/50 dark:bg-surface-700/50">
			<h2 id="advanced-search-title" class="text-center text-2xl font-bold text-tertiary-500 underline dark:text-primary-500">Advanced Search</h2>
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
					<button
						type="button"
						class="chip preset-outlined-primary-500 hover:preset-filled-primary-500 transition-colors"
						onclick={() => {
							const date = new SvelteDate();
							date.setDate(date.getDate() - 7);
							formValues.uploadedAfter = date.toISOString().split('T')[0];
							formValues.uploadedBefore = '';
						}}
					>
						<iconify-icon icon="mdi:calendar-week" width={24}></iconify-icon>
						<span>Recent (7 days)</span>
					</button>
					<button
						type="button"
						class="chip preset-outlined-primary-500 hover:preset-filled-primary-500 transition-colors"
						onclick={() => {
							const date = new SvelteDate();
							date.setDate(date.getDate() - 30);
							formValues.uploadedAfter = date.toISOString().split('T')[0];
							formValues.uploadedBefore = '';
						}}
					>
						<iconify-icon icon="mdi:calendar-month" width={24}></iconify-icon>
						<span>Recent (30 days)</span>
					</button>
					<button
						type="button"
						class="chip preset-outlined-primary-500 hover:preset-filled-primary-500 transition-colors"
						onclick={() => {
							formValues.minSize = '5';
							formValues.maxSize = '';
						}}
					>
						<iconify-icon icon="mdi:file-star" width={24}></iconify-icon>
						<span>Large (>5MB)</span>
					</button>
					<button
						type="button"
						class="chip preset-outlined-primary-500 hover:preset-filled-primary-500 transition-colors"
						onclick={() => {
							formValues.minWidth = '3840';
							formValues.minHeight = '2160';
						}}
					>
						<iconify-icon icon="mdi:monitor-screenshot" width={24}></iconify-icon>
						<span>4K+ Images</span>
					</button>
				</div>

				<hr class="border-surface-300 dark:border-surface-600" />

				<!-- Basic Search -->
				<section>
					<h3 class="mb-3 text-lg font-semibold text-tertiary-500 dark:text-primary-500">Basic Criteria</h3>
					<div class="grid gap-4 md:grid-cols-2">
						<label class="label">
							<span>Filename</span>
							<input type="text" bind:value={formValues.filename} class="input" placeholder="image.jpg" />
						</label>

						<label class="label">
							<span>Tags (comma-separated)</span>
							<input type="text" bind:value={formValues.tagsInput} class="input" placeholder="landscape, nature" />
							{#if suggestions.tags.length > 0}
								<div class="mt-1 text-xs text-surface-600 dark:text-surface-50">Suggestions: {suggestions.tags.join(', ')}</div>
							{/if}
						</label>
					</div>
				</section>

				<!-- Dimensions -->
				<section>
					<h3 class="mb-3 text-lg font-semibold text-tertiary-500 dark:text-primary-500">Dimensions</h3>
					<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
						<label class="label">
							<span>Min Width (px)</span>
							<input type="number" bind:value={formValues.minWidth} class="input" placeholder="1920" />
						</label>

						<label class="label">
							<span>Max Width (px)</span>
							<input type="number" bind:value={formValues.maxWidth} class="input" placeholder="3840" />
						</label>

						<label class="label">
							<span>Min Height (px)</span>
							<input type="number" bind:value={formValues.minHeight} class="input" placeholder="1080" />
						</label>

						<label class="label">
							<span>Max Height (px)</span>
							<input type="number" bind:value={formValues.maxHeight} class="input" placeholder="2160" />
						</label>
					</div>

					<div class="mt-4">
						<label class="label">
							<span>Aspect Ratio</span>
							<select bind:value={formValues.aspectRatio} class="select">
								<option value="any">Any</option>
								<option value="landscape">Landscape</option>
								<option value="portrait">Portrait</option>
								<option value="square">Square</option>
							</select>
						</label>
					</div>

					{#if suggestions.dimensions.length > 0}
						<div class="mt-2 text-xs text-surface-600 dark:text-surface-50">Common dimensions: {suggestions.dimensions.join(', ')}</div>
					{/if}
				</section>

				<!-- File Properties -->
				<section>
					<h3 class="mb-3 text-lg font-semibold text-tertiary-500 dark:text-primary-500">File Properties</h3>
					<div class="grid gap-4 md:grid-cols-3">
						<label class="label">
							<span>Min Size (MB)</span>
							<input type="number" bind:value={formValues.minSize} class="input" placeholder="1" step="0.1" />
						</label>

						<label class="label">
							<span>Max Size (MB)</span>
							<input type="number" bind:value={formValues.maxSize} class="input" placeholder="50" step="0.1" />
						</label>

						<label class="label">
							<span>File Types</span>
							<input type="text" bind:value={formValues.fileTypesInput} class="input" placeholder="image/jpeg, image/png" />
						</label>
					</div>
				</section>

				<!-- Dates -->
				<section>
					<h3 class="mb-3 text-lg font-semibold text-tertiary-500 dark:text-primary-500">Upload Dates</h3>
					<div class="grid gap-4 md:grid-cols-2">
						<label class="label">
							<span>Uploaded After</span>
							<input type="date" bind:value={formValues.uploadedAfter} class="input" />
						</label>

						<label class="label">
							<span>Uploaded Before</span>
							<input type="date" bind:value={formValues.uploadedBefore} class="input" />
						</label>
					</div>
				</section>

				<!-- EXIF & Metadata -->
				<section>
					<h3 class="mb-3 text-lg font-semibold text-tertiary-500 dark:text-primary-500">Metadata & EXIF</h3>
					<div class="grid gap-4 md:grid-cols-3">
						<label class="label">
							<span>Has EXIF Data</span>
							<select bind:value={formValues.hasEXIF} class="select">
								<option value="any">Any</option>
								<option value="yes">Yes</option>
								<option value="no">No</option>
							</select>
						</label>

						<label class="label">
							<span>Camera</span>
							<input type="text" bind:value={formValues.camera} class="input" placeholder="Canon EOS 5D" />
							{#if suggestions.cameras.length > 0}
								<div class="mt-1 text-xs text-surface-600 dark:text-surface-50">Found: {suggestions.cameras.join(', ')}</div>
							{/if}
						</label>

						<label class="label">
							<span>Location</span>
							<input type="text" bind:value={formValues.location} class="input" placeholder="New York" />
						</label>
					</div>
				</section>

				<!-- Advanced -->
				<section>
					<h3 class="mb-3 text-lg font-semibold text-tertiary-500 dark:text-primary-500">Advanced</h3>
					<div class="grid gap-4 md:grid-cols-2">
						<label class="label">
							<span>Dominant Color (hex)</span>
							<input type="text" bind:value={formValues.dominantColor} class="input" placeholder="#FF5733" />
						</label>

						<label class="label">
							<span>Hash Match</span>
							<input type="text" bind:value={formValues.hashMatch} class="input" placeholder="a1b2c3d4..." />
						</label>
					</div>

					<label class="mt-4 flex items-center gap-2">
						<input type="checkbox" bind:checked={formValues.showDuplicatesOnly} class="checkbox" />
						<span>Show Duplicates Only</span>
					</label>
				</section>
			</form>
		</div>

		<!-- Footer -->
		<div class="flex-none border-t border-surface-300 p-4 dark:border-surface-600 bg-surface-200/50 dark:bg-surface-700/50">
			<div class="flex items-center justify-between">
				<div class="text-sm hidden sm:block">
					<strong class="text-tertiary-500 dark:text-primary-500">Tip:</strong>
					Press
					<kbd class="preset-filled-tertiary-500 badge dark:preset-filled-primary-500">Ctrl+Enter</kbd>
					to search
				</div>

				<div class="flex gap-3 ml-auto">
					<button type="button" onclick={resetForm} class="preset-outlined-surface-500 btn">Reset</button>
					<button type="button" onclick={onClose} class="preset-outlined-surface-500 btn">Cancel</button>
					<button type="submit" form="advanced-search-form" class="preset-filled-primary-500 btn">
						<iconify-icon icon="mdi:magnify" width={20}></iconify-icon>
						Search
					</button>
				</div>
			</div>
		</div>
	</div>
</div>
