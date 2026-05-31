<!--
@file src/widgets/custom/Seo/input.svelte
@description SEO Widget Input Component.
Handles meta tags, social previews, and schema markup with multi-language support and SEO analysis.
-->

<script lang="ts">
	import { publicEnv } from '@src/stores/global-settings.svelte.ts';
	// Stores & Props
	import { app } from '@src/stores/store.svelte';
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';

	// Lucide Icons

	import { tokenTarget } from '@src/services/token/token-target';
	import type { SeoWidgetData } from '.';
	import SeoAnalysisPanel from './components/seo-analysis-panel.svelte';
	import SeoField from './components/seo-field.svelte';
	// Components
	import SeoPreview from './components/seo-preview.svelte';
	import SocialPreview from './components/social-preview.svelte';
	// Logic
	import { analyzeSeo } from './seo-analyzer';
	import { collections } from '@src/stores/collection-store.svelte';

	interface Props {
		field: any;
		validationError?: string | null;
		value?: Record<string, SeoWidgetData>;
	}

	let { field, value = $bindable(), validationError: _validationError }: Props = $props();

	// --- State ---
	let activeTab = $state(0);
	let seoPreviewMobile = $state(false);
	let analysisResults: any = $state(null);
	let showAnalysis = $state(false); // Collapsible analysis panel
	let isAnalyzing = $state(false);

	// Multi-language handling
	let availableLanguages = $state<string[]>([]);
	const lang = $derived(app.contentLanguage || 'en');
	const langData = $derived(value?.[lang]);

	// Optimized features lookup
	const enabledFeatures = $derived(new Set((field as any).defaults?.features || []));
	const hasFeature = (f: string) => enabledFeatures.has(f);

	// Pre-compute translation percentages
	const translationStats = $derived.by(() => {
		if (!value || availableLanguages.length === 0) return {};
		const stats: Record<string, number> = {};
		const fields: Array<keyof SeoWidgetData> = ['title', 'description', 'focusKeyword', 'ogTitle', 'ogDescription', 'twitterTitle', 'twitterDescription', 'schemaMarkup'];
		
		for (const f of fields) {
			const populated = availableLanguages.filter(l => value && value[l]?.[f]?.trim()).length;
			stats[f] = Math.round((populated / availableLanguages.length) * 100);
		}
		return stats;
	});

	// --- Lifecycle ---
	onMount(() => {
		// Initialize value structure if missing
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
		if (!langData) {
			return;
		}

		// Create dependency on relevant fields only
		void langData.title;
		void langData.description;
		void langData.focusKeyword;
		void langData.canonicalUrl;
		void langData.robotsMeta;

		// Debounce slightly to avoid rapid updates
		const timeout = setTimeout(() => {
			runAnalysis();
		}, 300);

		return () => clearTimeout(timeout);
	});

	// --- Actions ---

	async function runAnalysis() {
		if (!langData) return;
		isAnalyzing = true;

		const activeValue = collections.activeValue as any;
		const contentBody = String(activeValue?.content || activeValue?.body || '');

		try {
			analysisResults = await analyzeSeo(langData, contentBody);
		} catch (e) {
			console.error('SEO Analysis failed', e);
		} finally {
			isAnalyzing = false;
		}
	}

	// --- Actions ---
	const updateField = (fieldName: keyof SeoWidgetData, newVal: string) => {
		if (!langData) return;
		(langData as any)[fieldName] = newVal;
	};

	const isTranslated = $derived(!!field.translated);
	const placeholder = '{"@context": "https://schema.org", "@type": "Article", ...}';
</script>

<div class="space-y-4">
	<!-- Top Area: Preview & Analysis -->
	<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
		<!-- Left: Preview (Main) -->
		<div class="lg:col-span-2 space-y-4">
			<SeoPreview
				title={langData?.title || ''}
				description={langData?.description || ''}
				hostUrl={`${publicEnv.HOST_PROD}/${langData?.canonicalUrl || ''}`}
				bind:SeoPreviewToggle={seoPreviewMobile}
			/>
		</div>

		<!-- Right: Analysis Panel -->
		<div class="lg:col-span-1">
			<SeoAnalysisPanel 
				analysisResult={analysisResults} 
				{isAnalyzing} 
				bind:expanded={showAnalysis} 
				content={typeof (collections.activeValue as any)?.content === 'string' ? (collections.activeValue as any).content : (typeof (collections.activeValue as any)?.body === 'string' ? (collections.activeValue as any).body : '')}
				currentId={String(collections.activeValue?._id || '')}
				collectionId={String(collections.active?._id || '')}
			/>
		</div>
	</div>

	<!-- Bottom Area: Tabs & Inputs -->
	<div class="card p-4 variant-glass-surface">
		<!-- Inline Tabs Implementation -->
		<div class="flex border-b border-surface-400/30 mb-6">
			<button
				class="px-4 py-2 border-b-2 transition-colors hover:bg-surface-100 dark:hover:bg-surface-700/50 {activeTab === 0
					? 'border-primary-500 font-bold text-primary-500'
					: 'border-transparent text-surface-600 dark:text-surface-50 hover:text-surface-900 dark:hover:text-surface-200'}"
				onclick={() => (activeTab = 0)}
			>
				Basic
			</button>
			{#if hasFeature('social')}
				<button
					class="px-4 py-2 border-b-2 transition-colors hover:bg-surface-100 dark:hover:bg-surface-700/50 {activeTab === 1
						? 'border-primary-500 font-bold text-primary-500'
						: 'border-transparent text-surface-600 dark:text-surface-50 hover:text-surface-900 dark:hover:text-surface-200'}"
					onclick={() => (activeTab = 1)}
				>
					Social
				</button>
			{/if}
			{#if hasFeature('advanced')}
				<button
					class="px-4 py-2 border-b-2 transition-colors hover:bg-surface-100 dark:hover:bg-surface-700/50 {activeTab === 2
						? 'border-primary-500 font-bold text-primary-500'
						: 'border-transparent text-surface-600 dark:text-surface-50 hover:text-surface-900 dark:hover:text-surface-200'}"
					onclick={() => (activeTab = 2)}
				>
					Advanced
				</button>
			{/if}
		</div>

		<div class="mt-4 space-y-4" transition:slide>
			{#if langData}
				{#if activeTab === 0}
					<!-- Basic Tab -->

					<SeoField
						id="seo-title"
						label="Title"
						value={langData.title}
						{field}
						{lang}
						translated={isTranslated}
						translationPct={translationStats.title || 0}
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
						value={langData.description}
						{field}
						{lang}
						translated={isTranslated}
						translationPct={translationStats.description || 0}
						onUpdate={(v: string) => updateField('description', v)}
						maxLength={160}
						optimalMin={150}
						optimalMax={160}
						placeholder="Page Description"
					/>

					<SeoField
						id="seo-focusKeyword"
						label="Focus Keyword"
						value={langData.focusKeyword}
						{field}
						{lang}
						translated={isTranslated}
						translationPct={translationStats.focusKeyword || 0}
						onUpdate={(v: string) => updateField('focusKeyword', v)}
						placeholder="Main keyword"
					>
						<!-- Example of using slot for extra icon if needed --></SeoField
					>
				{:else if activeTab === 1}
					<!-- Social Tab (includes Preview) -->
					<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
						<div class="space-y-4">
							<h3 class="h3 font-bold">Open Graph (Facebook/LinkedIn)</h3>

							<SeoField
								id="seo-ogTitle"
								label="OG Title"
								value={langData.ogTitle || ''}
								{field}
								{lang}
								translated={isTranslated}
								translationPct={translationStats.ogTitle || 0}
								onUpdate={(v: string) => updateField('ogTitle', v)}
								placeholder="Open Graph Title (same as Title if empty)"
							/>

							<SeoField
								id="seo-ogDescription"
								label="OG Description"
								type="textarea"
								value={langData.ogDescription || ''}
								{field}
								{lang}
								translated={isTranslated}
								translationPct={translationStats.ogDescription || 0}
								onUpdate={(v: string) => updateField('ogDescription', v)}
								placeholder="Open Graph Description"
							/>
						</div>

						<div class="space-y-4">
							<h3 class="h3 font-bold">Twitter Card</h3>

							<SeoField
								id="seo-twitterTitle"
								label="Twitter Title"
								value={langData.twitterTitle || ''}
								{field}
								{lang}
								translated={isTranslated}
								translationPct={translationStats.twitterTitle || 0}
								onUpdate={(v: string) => updateField('twitterTitle', v)}
								placeholder="Twitter Title"
							/>

							<SeoField
								id="seo-twitterDescription"
								label="Twitter Description"
								type="textarea"
								value={langData.twitterDescription || ''}
								{field}
								{lang}
								translated={isTranslated}
								translationPct={translationStats.twitterDescription || 0}
								onUpdate={(v: string) => updateField('twitterDescription', v)}
								placeholder="Twitter Description"
							/>
						</div>
					</div>

					<div class="mt-6 pt-4 border-t border-surface-500/30">
						<SocialPreview
							ogTitle={langData.ogTitle || langData.title}
							ogDescription={langData.ogDescription || langData.description}
							twitterTitle={langData.twitterTitle || langData.title}
							twitterDescription={langData.twitterDescription || langData.description}
							hostUrl={publicEnv.HOST_PROD}
						/>
					</div>
				{:else if activeTab === 2}
					<!-- Advanced Tab -->

					<SeoField
						id="seo-robotsMeta"
						label="Robots Meta"
						value={langData.robotsMeta || ''}
						{field}
						{lang}
						translated={isTranslated}
						translationPct={translationStats.robotsMeta || 0}
						onUpdate={(v: string) => updateField('robotsMeta', v)}
						placeholder="index, follow"
					>
						{#snippet icon()}
							<iconify-icon icon="mdi:robot-happy-outline" width="24"></iconify-icon>
						{/snippet}
					</SeoField>

					<SeoField
						id="seo-canonicalUrl"
						label="Canonical URL"
						value={langData.canonicalUrl || ''}
						{field}
						{lang}
						translated={isTranslated}
						translationPct={translationStats.canonicalUrl || 0}
						onUpdate={(v: string) => updateField('canonicalUrl', v)}
						placeholder="https://example.com/slug"
					>
						{#snippet icon()}
							<iconify-icon icon="mdi:link-variant" width="24"></iconify-icon>
						{/snippet}
					</SeoField>

					<!-- Schema Markup (Textarea) -->
					<div class="space-y-2">
						<div class="flex items-center justify-between mb-1">
							<div class="flex items-center gap-2">
								<label for="seo-schemaMarkup" class="font-bold text-sm cursor-pointer">Schema.org JSON-LD</label>
								<iconify-icon icon="mdi:code-json" width="24"></iconify-icon>
							</div>
							{#if isTranslated}
								<div class="flex items-center gap-1 text-xs">
									<iconify-icon icon="bi:translate" width="24"></iconify-icon>
									<span class="font-medium text-primary-500">{lang.toUpperCase()}</span>
									<span class="font-medium text-surface-400 dark:text-surface-300">({translationStats.schemaMarkup || 0}%)</span>
								</div>
							{/if}
						</div>
						<div class="relative">
							<textarea
								id="seo-schemaMarkup"
								class="textarea font-mono text-xs"
								rows="10"
								{placeholder}
								value={langData.schemaMarkup || ''}
								oninput={(e) => updateField('schemaMarkup', (e.currentTarget as HTMLTextAreaElement).value)}
								use:tokenTarget={{ name: field.db_fieldName, label: field.label, collection: field.collection }}
							></textarea>
						</div>
						<p class="text-xs text-surface-400 dark:text-surface-300">Paste valid JSON-LD structure here.</p>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>
