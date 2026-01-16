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
	import type { MediaBase } from '@utils/media/mediaModels';
	import type { SearchCriteria } from '@utils/media/advancedSearch';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	interface Props {
		files: MediaBase[];
		onSearch: (criteria: SearchCriteria) => void;
		close: () => void;
	}

	const { files, onSearch, close }: Props = $props();

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
		const tags = new Set<string>();
		const cameras = new Set<string>();
		const dimensions = new Set<string>();

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
			minWidth: formValues.minWidth ? parseInt(formValues.minWidth) : undefined,
			maxWidth: formValues.maxWidth ? parseInt(formValues.maxWidth) : undefined,
			minHeight: formValues.minHeight ? parseInt(formValues.minHeight) : undefined,
			maxHeight: formValues.maxHeight ? parseInt(formValues.maxHeight) : undefined,
			aspectRatio: formValues.aspectRatio !== 'any' ? (formValues.aspectRatio as 'landscape' | 'portrait' | 'square') : undefined,
			minSize: formValues.minSize ? parseInt(formValues.minSize) * 1024 * 1024 : undefined, // Convert MB to bytes
			maxSize: formValues.maxSize ? parseInt(formValues.maxSize) * 1024 * 1024 : undefined,
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
			close();
		} else if (e.key === 'Enter' && e.ctrlKey) {
			handleSearch();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="max-h-[90vh] overflow-y-auto">
	<h2 id="advanced-search-title" class="mb-6 text-center text-2xl font-bold text-tertiary-500 underline dark:text-primary-500">Advanced Search</h2>

	<form
		onsubmit={(e) => {
			e.preventDefault();
			handleSearch();
		}}
		class="space-y-6"
	>
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
						<div class="mt-1 text-xs text-surface-600 dark:text-surface-400">
							Suggestions: {suggestions.tags.join(', ')}
						</div>
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
				<div class="mt-2 text-xs text-surface-600 dark:text-surface-400">
					Common dimensions: {suggestions.dimensions.join(', ')}
				</div>
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
						<div class="mt-1 text-xs text-surface-600 dark:text-surface-400">
							Found: {suggestions.cameras.join(', ')}
						</div>
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

		<!-- Actions -->
		<div class="flex justify-end gap-3 border-t border-surface-300 pt-4 dark:border-surface-600">
			<button type="button" onclick={resetForm} class="preset-ghost-surface-500 btn">Reset</button>
			<button type="button" onclick={close} class="preset-ghost-surface-500 btn">{m.button_cancel()}</button>
			<button type="submit" class="preset-filled-primary-500 btn">
				<iconify-icon icon="mdi:magnify" width="20"></iconify-icon>
				{m.MediaGallery_Search()}
			</button>
		</div>
	</form>

	<div class="text-md mt-4">
		<strong class="text-tertiary-500 dark:text-primary-500">Tip:</strong> Press
		<kbd class="preset-filled-tertiary-500 badge dark:preset-filled-primary-500">Ctrl+Enter</kbd>
		to search, <kbd class="preset-filled-tertiary-500 badge dark:preset-filled-primary-500">Esc</kbd> to close
	</div>
</div>
