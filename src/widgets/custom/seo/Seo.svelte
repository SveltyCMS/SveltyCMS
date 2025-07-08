<!-- 
@file src/widgets/seo/Seo.svelte
@component
**SEO widget for managing meta title, description, and robots meta tags**

@example
<Seo bind:value={value} />

#### Props
- `field`: FieldType
- `value`: any

#### Features
- Translatable
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { publicEnv } from '@root/config/public';

	// Stores
	import { contentLanguage, validationStore } from '@stores/store.svelte';
	import { mode, collectionValue } from '@root/src/stores/collectionStore.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { ProgressRadial } from '@skeletonlabs/skeleton';

	// Components
	import Heatmap from './Heatmap.svelte';
	import TitleInput from './TitleInput.svelte';
	import DescriptionInput from './DescriptionInput.svelte';
	import RobotsMetaInput from './RobotsMetaInput.svelte';
	import SeoPreview from './SeoPreview.svelte';

	interface Props {
		field: any;
		value?: any;
	}

	interface Suggestion {
		text: string;
		impact: number;
	}

	let { field, value = {} }: Props = $props();

	const fieldName = getFieldName(field);
	value = value || collectionValue.value[fieldName] || {};

	// State variables
	let _data = $state(mode.value === 'create' ? {} : value);
	let _language = $state(field?.translated ? $contentLanguage : publicEnv.DEFAULT_CONTENT_LANGUAGE);
	let title = $state('');
	let description = $state('');
	let robotsMeta = $state('index, follow');
	let titleCharacterWidth = $state(0);
	let descriptionCharacterWidth = $state(0);
	let SeoPreviewToggle = $state(false);
	let progress = $state(0);
	let suggestions = $state<Suggestion[]>([]);
	let hostUrl = $state('');
	let showHeatmap = $state(false);
	let seoKeywords = $state<string[]>([]);
	let validationError = $state<string | null>(null);
	let score = $state(0);

	// Initialize data structure
	$effect(() => {
		if (!_data[_language]) {
			_data[_language] = {};
		}
		title = _data[_language].title || '';
		description = _data[_language].description || '';
		robotsMeta = _data[_language].robotsMeta || 'index, follow';
	});

	// Update progress when score changes
	$effect(() => {
		progress = Math.round((score / (8 * 3)) * 100);
	});

	// Update _data when inputs change

	onMount(() => {
		hostUrl = window.location.origin;
	});

	// Calculate text width for proper display
	function calculateCharacterWidth(text: string, fontSize: number, fontFamily: string): number {
		const span = document.createElement('span');
		span.style.fontSize = `${fontSize}px`;
		span.style.fontFamily = fontFamily;
		span.innerHTML = text;
		document.body.appendChild(span);
		const characterWidth = span.offsetWidth;
		document.body.removeChild(span);
		return characterWidth;
	}

	// Handle title changes
	function handleTitleChange(event: Event) {
		title = (event.target as HTMLInputElement).value;
		titleCharacterWidth = calculateCharacterWidth(title, 16, 'Arial');
		suggestions = analyze(title, description);
		validateSeo();
	}

	// Handle description changes
	function handleDescriptionChange(event: Event) {
		description = (event.target as HTMLInputElement).value;
		descriptionCharacterWidth = calculateCharacterWidth(description, 14, 'Arial');
		suggestions = analyze(title, description);
		validateSeo();
	}

	function analyze(title: string, description: string): Suggestion[] {
		// Analysis logic...
		return [];
	}

	function validateSeo(): boolean {
		if (field?.required && (!title || !description)) {
			validationError = 'Title and description are required';
			validationStore.setError(fieldName, validationError);
			return false;
		}
		validationError = null;
		validationStore.clearError(fieldName);
		return true;
	}

	function handleHeatmapGenerated(event: CustomEvent<{ heatmapData: any; keywordDensity: any }>) {
		const { heatmapData, keywordDensity } = event.detail;
		console.log('Heatmap data:', heatmapData);
		console.log('Keyword density:', keywordDensity);
	}

	function handleKeywordsInput(event: Event) {
		seoKeywords = (event.target as HTMLInputElement).value.split(',').map((k) => k.trim().toLowerCase());
	}

	function toggleHeatmap() {
		showHeatmap = !showHeatmap;
	}

	function togglePreview() {
		SeoPreviewToggle = !SeoPreviewToggle;
	}

	// Export WidgetData for data binding with Fields.svelte
	export const WidgetData = async () => _data;
</script>

<div class="seo-container relative mb-4">
	<div class="input-container">
		<!-- Pass handleTitleChange as a prop -->
		<TitleInput {title} {titleCharacterWidth} {handleTitleChange} />
	</div>

	<div class="input-container mt-2">
		<!-- Pass handleDescriptionChange as a prop -->
		<DescriptionInput {description} {descriptionCharacterWidth} {handleDescriptionChange} />
	</div>

	<div class="input-container mt-2">
		<RobotsMetaInput bind:value={robotsMeta} />
	</div>

	<button class="toggle-heatmap" onclick={toggleHeatmap}>
		{showHeatmap ? 'Hide' : 'Show'} Heatmap
	</button>

	{#if showHeatmap}
		<div class="seo-heatmap-section" transition:fade={{ duration: 300 }}>
			<h3>SEO Content Heatmap</h3>
			<div class="input-group">
				<label for="seo-keywords">Enter keywords (comma-separated):</label>
				<input id="seo-keywords" type="text" oninput={handleKeywordsInput} placeholder="keyword1, keyword2, ..." />
			</div>
			<Heatmap content={title + ' ' + description} language={$contentLanguage} keywords={seoKeywords} on:heatmapGenerated={handleHeatmapGenerated} />
		</div>
	{/if}

	<SeoPreview {title} {description} {hostUrl} {SeoPreviewToggle} ontogglePreview={togglePreview} />

	<!-- Mobile ProgressRadial display -->
	<div class="md:hidden">
		<h3 class="mb-2 text-center">{m.widget_seo_suggestionlist()}</h3>
		<div class="flex items-center justify-around">
			<ProgressRadial value={progress} stroke={200} meter="stroke-primary-500" width="w-20 sm:w-28" class="mr-6 mt-1 text-white">
				{progress}%
			</ProgressRadial>
			<div class="flex flex-col items-center justify-start text-xs sm:text-sm">
				<div class="gap sm:flex sm:gap-4">
					<div class="flex justify-center gap-2">
						<iconify-icon icon="mdi:close-octagon" class="text-error-500" width="20"></iconify-icon>
						<span class="flex-auto">0 - 49</span>
					</div>
					<div class="flex justify-center gap-2">
						<span><iconify-icon icon="bi:hand-thumbs-up-fill" width="20" class="text-tertiary-500"></iconify-icon></span>
						<span class="flex-auto">50 - 79</span>
					</div>
					<div class="flex justify-center gap-2">
						<span><iconify-icon icon="material-symbols:check-circle-outline" class="text-success-500" width="20"></iconify-icon></span>
						<span class="flex-auto">80 - 100</span>
					</div>
				</div>
				<p class="mt-1 hidden text-justify !text-sm sm:block">
					{m.widget_seo_suggestiontext()}
				</p>
			</div>
		</div>
	</div>

	<!-- Desktop ProgressRadial display -->
	<div class="hidden md:block">
		<div class="mt-2 flex items-center justify-center dark:text-white">
			<ProgressRadial value={progress} stroke={200} meter="stroke-primary-500" class="mr-6 mt-1 w-20 text-2xl text-white">
				{progress}%
			</ProgressRadial>
			<div class="mb-2">
				<div class="mb-2 flex items-center justify-between lg:justify-start lg:gap-5">
					<h3 class="">{m.widget_seo_suggestionlist()}</h3>
					<div class="flex items-center gap-2">
						<iconify-icon icon="mdi:close-octagon" class="text-error-500" width="24"></iconify-icon>
						<span class="flex-auto">0 - 49</span>
					</div>
					<div class="flex items-center gap-2">
						<span><iconify-icon icon="bi:hand-thumbs-up-fill" width="24" class="text-tertiary-500"></iconify-icon></span>
						<span class="flex-auto">50 - 79</span>
					</div>
					<div class="flex items-center gap-2">
						<span><iconify-icon icon="material-symbols:check-circle-outline" class="text-success-500" width="24"></iconify-icon></span>
						<span class="flex-auto">80 - 100</span>
					</div>
				</div>
				<p>{m.widget_seo_suggestiontext()}</p>
			</div>
		</div>
	</div>

	<!-- Suggestions list -->
	<ul class="mt-1 grid md:grid-cols-2">
		{#each suggestions as suggestion}
			<li class="flex items-start p-1">
				<div class="mr-4 flex-none">
					{#if suggestion.impact === 3}
						<iconify-icon icon="material-symbols:check-circle-outline" class="text-success-500" width="24"></iconify-icon>
					{:else if suggestion.impact === 2}
						<iconify-icon icon="bi:hand-thumbs-up-fill" width="24" class="text-tertiary-500"></iconify-icon>
					{:else}
						<iconify-icon icon="mdi:close-octagon" class="text-error-500" width="24"></iconify-icon>
					{/if}
				</div>
				<span class="flex-auto text-sm">{suggestion.text}</span>
			</li>
		{/each}
	</ul>

	<!-- Error Message -->
	{#if validationError}
		<p id={`${field.db_fieldName}-error`} class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500" role="alert">
			{validationError}
		</p>
	{/if}
</div>

<style lang="postcss">
	.input-container {
		min-height: 2.5rem;
	}

	/* .error {
		border-color: rgb(239 68 68);
	} */
</style>
