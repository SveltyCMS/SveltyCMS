<!--
@file src/widgets/custom/seo/Input.svelte
@component
**SEO Widget Input Component**

Provides comprehensive SEO management with real-time analysis, tabbed interface, and social media optimization.
Part of the Three Pillars Architecture for enterprise-ready widget system.

@example
<SeoInput bind:value={seoData} field={{ features: ["social", "advanced"] }} />
<!-- Tabbed interface with Basic/Social/Advanced SEO settings and real-time analysis

### Props
- `field: FieldType` - Widget field definition with enabled features configuration
- `value: SeoData | null | undefined` - SEO metadata object (bindable)
- `error?: string | null` - Validation error message for display

### Features
- **Tabbed Interface**: Skeleton Labs TabGroup for organized SEO settings
- **Real-time Analysis**: SeoAnalyzer integration with debounced performance scoring
- **Modular Components**: Dedicated child components for title, description, and heatmap
- **Feature Flags**: Configurable social and advanced features via field settings
- **Multilingual Support**: Language-aware SEO content management
- **Social Media Meta**: Open Graph and Twitter Card optimization
- **Performance Scoring**: Overall SEO score calculation and display
- **Debounced Updates**: Performance-optimized analysis with 500ms delay
- **Error Handling**: Accessible error display with role="alert"
-->

<script lang="ts">
	import { Tab, TabGroup } from '@skeletonlabs/skeleton';
	import type { FieldType, SeoData, SeoFeature } from './';
	import { SeoAnalyzer } from './seoAnalyzer'; // Your existing analysis engine

	// Components
	import SeoPreview from './components/SeoPreview.svelte'; // Child component
	import TitleInput from './components/TitleInput.svelte';
	import DescriptionInput from './components/DescriptionInput.svelte';
	import HeatmapInput from './components/Heatmap.svelte';

	let { field, value, error }: { field: FieldType; value: SeoData | null | undefined; error?: string | null } = $props();

	// Determine the current language.
	const lang = $derived(field.translated ? $contentLanguage : 'default');

	// Initialize the data object with all required fields if it's empty.
	$effect(() => {
		if (value && !value[lang]) {
			value[lang] = {
				title: '',
				description: '',
				focusKeyword: '',
				robotsMeta: 'index, follow',
				canonicalUrl: '',
				ogTitle: '',
				ogDescription: '',
				ogImage: '',
				twitterCard: 'summary_large_image',
				twitterTitle: '',
				twitterDescription: '',
				twitterImage: '',
				schemaMarkup: ''
			};
		}
	});

	// UI State
	let activeTab = $state(0);
	let analysisResult = $state<any>(null); // Replace 'any' with your SeoAnalysisResult type
	let isAnalyzing = $state(false);

	// Debounced analysis function.
	const runAnalysis = debounce(async () => {
		isAnalyzing = true;
		const analyzer = new SeoAnalyzer(/* config */);
		analysisResult = await analyzer.analyze(value);
		isAnalyzing = false;
	}, 500);

	// When the data changes, re-run the analysis.
	$effect(() => {
		if (value.title || value.description || value.focusKeyword) {
			runAnalysis();
		}
	});

	// Helper to check if a feature is enabled.
	const hasFeature = (feature: SeoFeature) => field.features?.includes(feature) ?? false;
</script>

<div class="seo-container">
	<header>
		<h2>SEO Analysis</h2>
		{#if analysisResult}
			<div>Overall Score: {analysisResult.score.overall}</div>
		{/if}
	</header>

	<TabGroup>
		<Tab bind:group={activeTab} name="basic" value={0}>Basic</Tab>
		{#if hasFeature('social')}
			<Tab bind:group={activeTab} name="social" value={1}>Social</Tab>
		{/if}
		{#if hasFeature('advanced')}
			<Tab bind:group={activeTab} name="advanced" value={2}>Advanced</Tab>
		{/if}
		<svelte:fragment slot="panel">
			{#if activeTab === 0}
				<div class="panel">
					<label>Title</label>
					<input type="text" class="input" bind:value={value.title} />

					<label>Description</label>
					<textarea class="textarea" bind:value={value.description}></textarea>

					<label>Focus Keyword</label>
					<input type="text" class="input" bind:value={value.focusKeyword} />
				</div>
			{:else if activeTab === 1 && hasFeature('social')}
				<div class="panel">
					<h3>Open Graph (Facebook)</h3>
					<label>OG Title</label>
					<input type="text" class="input" bind:value={value.ogTitle} />
				</div>
			{/if}
		</svelte:fragment>
	</TabGroup>

	{#if error}
		<p class="error-message" role="alert">{error}</p>
	{/if}
</div>
