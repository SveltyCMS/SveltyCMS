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
- `onSearch: (criteria: SearchCriteria, jsonPath: string) => void` - Callback with search results
- `onClose: () => void` - Callback to close modal
- `initialJsonPath: string` - Existing metadata query, echoed back on reopen

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
	import Tooltip from '@components/ui/tooltip.svelte';
	import HelpIcon from '@components/ui/help-icon.svelte';
	import {
		button_cancel,
		button_reset,
		common_advanced,
		MediaGallery_Search,
		mediagallery_advanced_search,
		mediagallery_basic_criteria,
		mediagallery_camera_placeholder,
		mediagallery_common_dimensions,
		mediagallery_ctrl_enter,
		mediagallery_dimensions,
		mediagallery_filename_placeholder,
		mediagallery_file_properties,
		mediagallery_found,
		mediagallery_id_placeholder,
		mediagallery_json_path_filter,
		mediagallery_json_path_helper_part1,
		mediagallery_json_path_helper_part2,
		mediagallery_json_path_helper_part3,
		mediagallery_json_path_placeholder,
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
		onSearch: (criteria: SearchCriteria, jsonPath: string) => void;
		/** Existing metadata query, echoed back so the filter survives a reopen. */
		initialJsonPath?: string;
	}

	const { files, onSearch, onClose, initialJsonPath = '' }: Props = $props();

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

	/**
	 * Per-field help shown behind the `?` trigger next to each label. The labels
	 * themselves are still the ones painted by the control, so the tooltip text
	 * only explains what the value does to the result set.
	 */
	const FIELD_HELP = {
		filename: 'Match files whose name contains this text.',
		tags: 'Comma-separated tags. A file matches when it carries any of them.',
		minWidth: 'Smallest accepted original width in pixels.',
		maxWidth: 'Largest accepted original width in pixels.',
		minHeight: 'Smallest accepted original height in pixels.',
		maxHeight: 'Largest accepted original height in pixels.',
		aspectRatio:
			'Landscape is wider than tall, portrait is taller than wide, square has equal sides.',
		minSize: 'Smallest accepted file size in megabytes (1 MB = 1024 × 1024 bytes).',
		maxSize: 'Largest accepted file size in megabytes (1 MB = 1024 × 1024 bytes).',
		fileTypes: 'Comma-separated MIME types, for example image/jpeg, image/png.',
		uploadedAfter: 'Only files uploaded on or after this date.',
		uploadedBefore: 'Only files uploaded on or before this date.',
		hasEXIF: 'Restrict the result to files that do or do not carry EXIF metadata.',
		camera: 'Matches the camera model recorded in the EXIF data.',
		location: 'Matches the location string recorded in the EXIF data.',
		dominantColor: 'Hex colour; finds images whose dominant colour is close to this value.',
		hashMatch: 'Content hash, for finding exact duplicates of a file.',
		jsonPath:
			'Metadata expression evaluated per file. Supports `path = value` comparisons joined with `;`.',
		duplicates: 'Only show files that share a content hash with another file.'
	};

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
		hashMatch: '',
		// svelte-ignore state_referenced_locally — the query is seeded once per modal open
		jsonPath: initialJsonPath
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

		onSearch(searchCriteria, formValues.jsonPath.trim());
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
			hashMatch: '',
			jsonPath: ''
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

<!-- Shared label with a `?` help trigger — one trigger per field, never the
     whole label wrapped, so the tooltip cannot swallow the control's click. -->
{#snippet fieldLabel(text: string, help: string)}
	<span class="inline-flex items-center gap-1.5 text-sm font-medium leading-none">
		<span>{text}</span>
		<Tooltip title={help}>
			<HelpIcon ariaLabel="{text} information" tabindex={0} />
		</Tooltip>
	</span>
{/snippet}

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
			class="flex-none border-b border-surface-500/30 bg-surface-200/50 px-4 py-3 dark:border-surface-600 dark:bg-surface-700/50"
		>
			<h2
				id="advanced-search-title"
				class="text-center text-2xl font-bold text-tertiary-500 underline dark:text-primary-500"
			>
				{mediagallery_advanced_search()}
			</h2>
		</div>

		<!-- Scrollable Body -->
		<div class="flex-1 overflow-y-auto p-4 sm:p-5">
			<form
				id="advanced-search-form"
				onsubmit={(e) => {
					e.preventDefault();
					handleSearch();
				}}
				class="space-y-4"
			>
				<!-- Search Presets -->
				<div class="flex flex-wrap gap-2">
					<Button
						variant="outline"
						size="sm"
						type="button"
						class="border-tertiary-500/40 text-tertiary-500 hover:bg-tertiary-500 hover:text-white dark:border-primary-500/40 dark:text-primary-400 dark:hover:bg-primary-500 dark:hover:text-white transition-colors"
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
						size="sm"
						type="button"
						class="border-tertiary-500/40 text-tertiary-500 hover:bg-tertiary-500 hover:text-white dark:border-primary-500/40 dark:text-primary-400 dark:hover:bg-primary-500 dark:hover:text-white transition-colors"
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
						size="sm"
						type="button"
						class="border-tertiary-500/40 text-tertiary-500 hover:bg-tertiary-500 hover:text-white dark:border-primary-500/40 dark:text-primary-400 dark:hover:bg-primary-500 dark:hover:text-white transition-colors"
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
						size="sm"
						type="button"
						class="border-tertiary-500/40 text-tertiary-500 hover:bg-tertiary-500 hover:text-white dark:border-primary-500/40 dark:text-primary-400 dark:hover:bg-primary-500 dark:hover:text-white transition-colors"
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
					<div class="grid gap-3 md:grid-cols-2">
						<Input
							bind:value={formValues.filename}
							placeholder={mediagallery_filename_placeholder()}
						>
							{#snippet labelSnippet()}
								{@render fieldLabel('Filename', FIELD_HELP.filename)}
							{/snippet}
						</Input>
						<div>
							<Input
								bind:value={formValues.tagsInput}
								placeholder={mediagallery_tags_placeholder()}
							>
								{#snippet labelSnippet()}
									{@render fieldLabel('Tags (comma-separated)', FIELD_HELP.tags)}
								{/snippet}
							</Input>
							{#if suggestions.tags.length > 0}
								<div class="mt-1 text-xs text-(--admin-text-muted) dark:text-surface-50">
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
					<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
						<Input bind:value={formValues.minWidth} type="number" placeholder="1920">
							{#snippet labelSnippet()}
								{@render fieldLabel('Min Width (px)', FIELD_HELP.minWidth)}
							{/snippet}
						</Input>
						<Input bind:value={formValues.maxWidth} type="number" placeholder="3840">
							{#snippet labelSnippet()}
								{@render fieldLabel('Max Width (px)', FIELD_HELP.maxWidth)}
							{/snippet}
						</Input>
						<Input bind:value={formValues.minHeight} type="number" placeholder="1080">
							{#snippet labelSnippet()}
								{@render fieldLabel('Min Height (px)', FIELD_HELP.minHeight)}
							{/snippet}
						</Input>
						<Input bind:value={formValues.maxHeight} type="number" placeholder="2160">
							{#snippet labelSnippet()}
								{@render fieldLabel('Max Height (px)', FIELD_HELP.maxHeight)}
							{/snippet}
						</Input>
					</div>

					<div class="mt-3">
						<Select bind:value={formValues.aspectRatio} options={aspectRatioOptions} placeholder="">
							{#snippet labelSnippet()}
								{@render fieldLabel('Aspect Ratio', FIELD_HELP.aspectRatio)}
							{/snippet}
						</Select>
					</div>

					{#if suggestions.dimensions.length > 0}
						<div class="mt-2 text-xs text-(--admin-text-muted) dark:text-surface-50">
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
					<div class="grid gap-3 md:grid-cols-3">
						<Input bind:value={formValues.minSize} type="number" placeholder="1" step="0.1">
							{#snippet labelSnippet()}
								{@render fieldLabel('Min Size (MB)', FIELD_HELP.minSize)}
							{/snippet}
						</Input>
						<Input bind:value={formValues.maxSize} type="number" placeholder="50" step="0.1">
							{#snippet labelSnippet()}
								{@render fieldLabel('Max Size (MB)', FIELD_HELP.maxSize)}
							{/snippet}
						</Input>
						<Input
							bind:value={formValues.fileTypesInput}
							placeholder={mediagallery_mime_placeholder()}
						>
							{#snippet labelSnippet()}
								{@render fieldLabel('File Types', FIELD_HELP.fileTypes)}
							{/snippet}
						</Input>
					</div>
				</section>

				<!-- Dates -->
				<section>
					<h3 class="mb-3 text-lg font-semibold text-tertiary-500 dark:text-primary-500">
						{mediagallery_upload_dates()}
					</h3>
					<div class="grid gap-3 md:grid-cols-2">
						<Input bind:value={formValues.uploadedAfter} type="date">
							{#snippet labelSnippet()}
								{@render fieldLabel('Uploaded After', FIELD_HELP.uploadedAfter)}
							{/snippet}
						</Input>
						<Input bind:value={formValues.uploadedBefore} type="date">
							{#snippet labelSnippet()}
								{@render fieldLabel('Uploaded Before', FIELD_HELP.uploadedBefore)}
							{/snippet}
						</Input>
					</div>
				</section>

				<!-- EXIF & Metadata -->
				<section>
					<h3 class="mb-3 text-lg font-semibold text-tertiary-500 dark:text-primary-500">
						{mediagallery_metadata_exif()}
					</h3>
					<div class="grid gap-3 md:grid-cols-3">
						<Select bind:value={formValues.hasEXIF} options={hasExifOptions} placeholder="">
							{#snippet labelSnippet()}
								{@render fieldLabel('Has EXIF Data', FIELD_HELP.hasEXIF)}
							{/snippet}
						</Select>
						<div>
							<Input bind:value={formValues.camera} placeholder={mediagallery_camera_placeholder()}>
								{#snippet labelSnippet()}
									{@render fieldLabel('Camera', FIELD_HELP.camera)}
								{/snippet}
							</Input>
							{#if suggestions.cameras.length > 0}
								<div class="mt-1 text-xs text-(--admin-text-muted) dark:text-surface-50">
									{mediagallery_found()}
									{suggestions.cameras.join(', ')}
								</div>
							{/if}
						</div>
						<Input
							bind:value={formValues.location}
							placeholder={mediagallery_location_placeholder()}
						>
							{#snippet labelSnippet()}
								{@render fieldLabel('Location', FIELD_HELP.location)}
							{/snippet}
						</Input>
					</div>
				</section>

				<!-- Advanced -->
				<section>
					<h3 class="mb-3 text-lg font-semibold text-tertiary-500 dark:text-primary-500">
						{common_advanced()}
					</h3>
					<div class="grid gap-3 md:grid-cols-2">
						<Input bind:value={formValues.dominantColor} placeholder="#FF5733">
							{#snippet labelSnippet()}
								{@render fieldLabel('Dominant Color (hex)', FIELD_HELP.dominantColor)}
							{/snippet}
						</Input>
						<Input bind:value={formValues.hashMatch} placeholder={mediagallery_id_placeholder()}>
							{#snippet labelSnippet()}
								{@render fieldLabel('Hash Match', FIELD_HELP.hashMatch)}
							{/snippet}
						</Input>
					</div>

					<div class="mt-3">
						<Input
							bind:value={formValues.jsonPath}
							placeholder={mediagallery_json_path_placeholder()}
							data-testid="media-json-path-filter"
						>
							{#snippet labelSnippet()}
								{@render fieldLabel(mediagallery_json_path_filter(), FIELD_HELP.jsonPath)}
							{/snippet}
						</Input>
						<p class="mt-1 text-xs text-(--admin-text-muted)">
							{mediagallery_json_path_helper_part1()}{' '}
							<code dir="ltr">metadata.exif.camera = Canon</code>.{' '}
							{mediagallery_json_path_helper_part2()}{' '}
							<code>;</code>{mediagallery_json_path_helper_part3()}
						</p>
					</div>

					<div class="mt-3">
						<Checkbox
							bind:checked={formValues.showDuplicatesOnly}
							label="Show Duplicates Only"
							description={FIELD_HELP.duplicates}
						/>
					</div>
				</section>
			</form>
		</div>

		<!-- Footer -->
		<div
			class="flex-none border-t border-surface-500/30 bg-surface-200/50 px-4 py-3 dark:border-surface-600 dark:bg-surface-700/50"
		>
			<div class="flex items-center justify-between">
				<div class="hidden text-sm sm:block">
					<strong class="text-tertiary-500 dark:text-primary-500">{mediagallery_tip()}</strong>
					{mediagallery_press()}
					<kbd
						class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-tertiary-500 text-white dark:bg-primary-500"
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
