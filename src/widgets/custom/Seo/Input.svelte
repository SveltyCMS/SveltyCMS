<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';

	// Stores & Props
	import { contentLanguage } from '@stores/store.svelte';
	import { publicEnv } from '@stores/globalSettings.svelte';

	// Parsers & Services
	import { tokenTarget } from '@src/services/token/tokenTarget';
	import type { SeoWidgetData } from '.';

	// Components
	import SeoAnalysisPanel from './components/SeoAnalysisPanel.svelte';
	import SeoPreview from './components/SeoPreview.svelte';
	import SocialPreview from './components/SocialPreview.svelte';
	import SeoField from './components/SeoField.svelte'; // Reusable field component

	// Logic
	import { analyzeSeo } from './seoAnalyzer';

	interface Props {
		field: any;
		value?: Record<string, SeoWidgetData>;
		validationError?: string | null;
	}

	let { field, value = $bindable(), validationError: _validationError }: Props = $props();

	// --- State ---
	let activeTab = $state(0);
	let analysisResults: any = $state(null);
	let showAnalysis = $state(false); // Collapsible analysis panel
	let isAnalyzing = $state(false);

	// Multi-language handling
	let availableLanguages = $state<string[]>([]);
	// Use contentLanguage store value
	const currentLang = $derived(contentLanguage.value);
	// Fallback to 'en' if no language selected
	let lang = $derived(currentLang || 'en');

	// --- Lifecycle ---
	onMount(() => {
		// Initialize value structure if missing
		if (!value) value = {};
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
			} as SeoWidgetData;
		}

		// Get available languages from config/store if possible
		if (publicEnv.AVAILABLE_CONTENT_LANGUAGES) {
			availableLanguages = [publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en', ...publicEnv.AVAILABLE_CONTENT_LANGUAGES];
		} else {
			availableLanguages = ['en'];
		}
	});

	// --- Analysis Trigger Optimization ---
	// Only run analysis when relevant fields change to improve performance
	$effect(() => {
		const langData = value?.[lang];
		if (!langData) return;

		// Create dependency on relevant fields only
		langData.title;
		langData.description;
		langData.focusKeyword;
		langData.canonicalUrl;
		langData.robotsMeta;

		// Debounce slightly to avoid rapid updates
		const timeout = setTimeout(() => {
			runAnalysis();
		}, 300);

		return () => clearTimeout(timeout);
	});

	// --- Actions ---

	async function runAnalysis() {
		if (!value || !value[lang]) return;
		isAnalyzing = true;

		// TODO: Connect to actual content store when available
		const contentBody = '';

		try {
			analysisResults = await analyzeSeo(value[lang], contentBody);
		} catch (e) {
			console.error('SEO Analysis failed', e);
		} finally {
			isAnalyzing = false;
		}
	}

	function hasFeature(feature: string): boolean {
		return (field as any).defaults?.features?.includes(feature) ?? true;
	}

	// --- Helper: Translation Percentage ---
	function getFieldTranslationPercentage(fieldName: string): number {
		if (!value || availableLanguages.length === 0) return 0;
		const safeValue = value; // Capture for closure safety
		const populatedCount = availableLanguages.filter((l) => {
			const langData = safeValue[l];
			if (!langData) return false;
			const fieldData = langData[fieldName as keyof SeoWidgetData];
			return typeof fieldData === 'string' && fieldData.trim() !== '';
		}).length;
		return Math.round((populatedCount / availableLanguages.length) * 100);
	}

	// --- UI Helpers ---
	// Update wrapper for SeoField to bind back to the deeply nested value
	const updateField = (fieldName: keyof SeoWidgetData, newVal: string) => {
		if (!value || !value[lang]) return;
		// Cast to any to allow updating union types like twitterCard with strict string
		(value[lang] as any)[fieldName] = newVal;
	};

	// Determine if field is translated based on widget config
	const isTranslated = $derived(field.translated);

	const placeholder = '{"@context": "https://schema.org", "@type": "Article", ...}';
</script>

<div class="space-y-4">
	<!-- Top Area: Preview & Analysis -->
	<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
		<!-- Left: Preview (Main) -->
		<div class="lg:col-span-2 space-y-4">
			<SeoPreview
				title={value?.[lang]?.title || ''}
				description={value?.[lang]?.description || ''}
				hostUrl={`${publicEnv.HOST_PROD}/${value?.[lang]?.canonicalUrl || ''}`}
				SeoPreviewToggle={false}
			/>
		</div>

		<!-- Right: Analysis Panel -->
		<div class="lg:col-span-1">
			<SeoAnalysisPanel analysisResult={analysisResults} {isAnalyzing} bind:expanded={showAnalysis} />
		</div>
	</div>

	<!-- Bottom Area: Tabs & Inputs -->
	<div class="card p-4 preset-glass-surface">
		<!-- Inline Tabs Implementation -->
		<div class="flex border-b border-surface-400/30 mb-6">
			<button
				class="px-4 py-2 border-b-2 transition-colors hover:bg-surface-100 dark:hover:bg-surface-700/50 {activeTab === 0
					? 'border-primary-500 font-bold text-primary-500'
					: 'border-transparent text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-200'}"
				onclick={() => (activeTab = 0)}
			>
				Basic
			</button>
			{#if hasFeature('social')}
				<button
					class="px-4 py-2 border-b-2 transition-colors hover:bg-surface-100 dark:hover:bg-surface-700/50 {activeTab === 1
						? 'border-primary-500 font-bold text-primary-500'
						: 'border-transparent text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-200'}"
					onclick={() => (activeTab = 1)}
				>
					Social
				</button>
			{/if}
			{#if hasFeature('advanced')}
				<button
					class="px-4 py-2 border-b-2 transition-colors hover:bg-surface-100 dark:hover:bg-surface-700/50 {activeTab === 2
						? 'border-primary-500 font-bold text-primary-500'
						: 'border-transparent text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-surface-200'}"
					onclick={() => (activeTab = 2)}
				>
					Advanced
				</button>
			{/if}
		</div>

		<div class="mt-4 space-y-4" transition:slide>
			{#if value && value[lang]}
				{#if activeTab === 0}
					<!-- Basic Tab -->

					<SeoField
						id="seo-title"
						label="Title"
						value={value[lang].title}
						{field}
						{lang}
						translated={isTranslated}
						translationPct={getFieldTranslationPercentage('title')}
						onUpdate={(v: string) => updateField('title', v)}
						maxLength={60}
						optimalMin={50}
						optimalMax={60}
						placeholder="Page Title"
					/>

					<SeoField
						id="seo-description"
						label="Description"
						type="textarea"
						value={value[lang].description}
						{field}
						{lang}
						translated={isTranslated}
						translationPct={getFieldTranslationPercentage('description')}
						onUpdate={(v: string) => updateField('description', v)}
						maxLength={160}
						optimalMin={150}
						optimalMax={160}
						placeholder="Page Description"
					/>

					<SeoField
						id="seo-focusKeyword"
						label="Focus Keyword"
						value={value[lang].focusKeyword}
						{field}
						{lang}
						translated={isTranslated}
						translationPct={getFieldTranslationPercentage('focusKeyword')}
						onUpdate={(v: string) => updateField('focusKeyword', v)}
						placeholder="Main keyword"
					>
						<!-- Example of using slot for extra icon if needed -->
					</SeoField>
				{:else if activeTab === 1}
					<!-- Social Tab (includes Preview) -->
					<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
						<div class="space-y-4">
							<h3 class="h3 font-bold">Open Graph (Facebook/LinkedIn)</h3>

							<SeoField
								id="seo-ogTitle"
								label="OG Title"
								value={value[lang].ogTitle || ''}
								{field}
								{lang}
								translated={isTranslated}
								translationPct={getFieldTranslationPercentage('ogTitle')}
								onUpdate={(v: string) => updateField('ogTitle', v)}
								placeholder="Open Graph Title (same as Title if empty)"
							/>

							<SeoField
								id="seo-ogDescription"
								label="OG Description"
								type="textarea"
								value={value[lang].ogDescription || ''}
								{field}
								{lang}
								translated={isTranslated}
								translationPct={getFieldTranslationPercentage('ogDescription')}
								onUpdate={(v: string) => updateField('ogDescription', v)}
								placeholder="Open Graph Description"
							/>
						</div>

						<div class="space-y-4">
							<h3 class="h3 font-bold">Twitter Card</h3>

							<SeoField
								id="seo-twitterTitle"
								label="Twitter Title"
								value={value[lang].twitterTitle || ''}
								{field}
								{lang}
								translated={isTranslated}
								translationPct={getFieldTranslationPercentage('twitterTitle')}
								onUpdate={(v: string) => updateField('twitterTitle', v)}
								placeholder="Twitter Title"
							/>

							<SeoField
								id="seo-twitterDescription"
								label="Twitter Description"
								type="textarea"
								value={value[lang].twitterDescription || ''}
								{field}
								{lang}
								translated={isTranslated}
								translationPct={getFieldTranslationPercentage('twitterDescription')}
								onUpdate={(v: string) => updateField('twitterDescription', v)}
								placeholder="Twitter Description"
							/>
						</div>
					</div>

					<div class="mt-6 pt-4 border-t border-surface-500/30">
						<SocialPreview
							ogTitle={value[lang].ogTitle || value[lang].title}
							ogDescription={value[lang].ogDescription || value[lang].description}
							twitterTitle={value[lang].twitterTitle || value[lang].title}
							twitterDescription={value[lang].twitterDescription || value[lang].description}
							hostUrl={publicEnv.HOST_PROD}
						/>
					</div>
				{:else if activeTab === 2}
					<!-- Advanced Tab -->

					<SeoField
						id="seo-robotsMeta"
						label="Robots Meta"
						value={value[lang].robotsMeta || ''}
						{field}
						{lang}
						translated={isTranslated}
						translationPct={getFieldTranslationPercentage('robotsMeta')}
						onUpdate={(v: string) => updateField('robotsMeta', v)}
						placeholder="index, follow"
					>
						{#snippet icon()}
							<iconify-icon icon="mdi:robot-happy-outline" width="16"></iconify-icon>
						{/snippet}
					</SeoField>

					<SeoField
						id="seo-canonicalUrl"
						label="Canonical URL"
						value={value[lang].canonicalUrl || ''}
						{field}
						{lang}
						translated={isTranslated}
						translationPct={getFieldTranslationPercentage('canonicalUrl')}
						onUpdate={(v: string) => updateField('canonicalUrl', v)}
						placeholder="https://example.com/slug"
					>
						{#snippet icon()}
							<iconify-icon icon="mdi:link-variant" width="16"></iconify-icon>
						{/snippet}
					</SeoField>

					<!-- Schema Markup (Textarea) -->
					<div class="space-y-2">
						<div class="flex items-center justify-between mb-1">
							<div class="flex items-center gap-2">
								<span class="font-bold text-sm">Schema.org JSON-LD</span>
								<iconify-icon icon="mdi:code-json" width="16"></iconify-icon>
							</div>
							{#if isTranslated}
								<div class="flex items-center gap-1 text-xs">
									<iconify-icon icon="bi:translate" width="16"></iconify-icon>
									<span class="font-medium text-tertiary-500 dark:text-primary-500">{lang.toUpperCase()}</span>
									<span class="font-medium text-surface-400">({getFieldTranslationPercentage('schemaMarkup')}%)</span>
								</div>
							{/if}
						</div>
						<div class="relative">
							<textarea
								id="seo-schemaMarkup"
								class="textarea font-mono text-xs"
								rows="10"
								{placeholder}
								value={value[lang].schemaMarkup || ''}
								oninput={(e) => updateField('schemaMarkup', (e.currentTarget as HTMLTextAreaElement).value)}
								use:tokenTarget={{ name: field.db_fieldName, label: field.label, collection: field.collection }}
							></textarea>
						</div>
						<p class="text-xs text-surface-400">Paste valid JSON-LD structure here.</p>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>
