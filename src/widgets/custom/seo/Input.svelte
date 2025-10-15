<!--
@file src/widgets/custom/seo/Input.svelte
@component
**SEO Widget Input Component**

Provides comprehensive SEO management with real-time analysis, tabbed interface, and social media optimization.
Part of the Three Pillars Architecture for wSidget system.

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
import { Tab, TabGroup } from '@skeletonlabs/skeleton-svelte';
	import { contentLanguage } from '@stores/store.svelte';
	import { debounce } from '@utils/utils';
	import type { FieldType } from './';
	import { SeoAnalyzer } from './seoAnalyzer';
	import type { SeoData, SeoFeature } from './types';

	// Components
	// Child component

	let { field, value, error }: { field: FieldType; value: Record<string, SeoData> | null | undefined; error?: string | null } = $props();

	// Determine the current language.
	const lang = $derived(field.translated ? contentLanguage.value : 'default');

	// Initialize the data object with all required fields if it's empty.
	$effect(() => {
		if (!value) {
			value = {};
		}
		if (!value[lang]) {
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

	// Debounced analysis function.
	const runAnalysis = debounce.create(async () => {
		if (!value || !value[lang]) return;
		try {
			const config = {
				focusKeyword: value[lang].focusKeyword || '',
				locale: lang,
				contentLanguage: lang,
				targetAudience: 'general' as const,
				contentType: 'article' as const,
				enableRealTimeAnalysis: true,
				analysisDepth: 'standard' as const,
				enabledFeatures: {
					basic: true,
					advanced: true,
					social: true,
					schema: true,
					ai: false,
					readability: true,
					keywords: true,
					preview: true
				}
			};
			const analyzer = new SeoAnalyzer(config);
			const data = value[lang];
			analysisResult = await analyzer.analyze(
				data.title || '',
				data.description || '',
				'', // content - could be extracted from other fields
				data.canonicalUrl
			);
		} catch (error) {
			console.error('SEO Analysis failed:', error);
		}
	}, 500);

	// When the data changes, re-run the analysis.
	$effect(() => {
		if (value && value[lang] && (value[lang].title || value[lang].description || value[lang].focusKeyword)) {
			runAnalysis();
		}
	});

	// Helper to check if a feature is enabled.
	const hasFeature = (feature: SeoFeature) => {
		const features = (field as any)?.features || [];
		return Array.isArray(features) && features.includes(feature);
	};
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
					{#if value && value[lang]}
						<label for="seo-title">Title</label>
						<input id="seo-title" type="text" class="input" bind:value={value[lang].title} />

						<label for="seo-description">Description</label>
						<textarea id="seo-description" class="textarea" bind:value={value[lang].description}></textarea>

						<label for="seo-keyword">Focus Keyword</label>
						<input id="seo-keyword" type="text" class="input" bind:value={value[lang].focusKeyword} />
					{/if}
				</div>
			{:else if activeTab === 1 && hasFeature('social')}
				<div class="panel">
					<h3>Open Graph (Facebook)</h3>
					{#if value && value[lang]}
						<label for="seo-og-title">OG Title</label>
						<input id="seo-og-title" type="text" class="input" bind:value={value[lang].ogTitle} />
					{/if}
				</div>
			{/if}
		</svelte:fragment>
	</TabGroup>

	{#if error}
		<p class="error-message" role="alert">{error}</p>
	{/if}
</div>
