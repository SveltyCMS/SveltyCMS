<!--
@file src/widgets/custom/Seo/input.svelte
@description SEO Widget Input Component.
Handles meta tags, social previews, and schema markup with multi-language support and SEO analysis.
-->

<script lang="ts">
import { logger } from "@utils/logger";
	import { publicEnv } from '@src/stores/global-settings.svelte.ts';
	// Stores & Props
	import { app } from '@src/stores/store.svelte';
	import { onMount } from 'svelte';

	// Lucide Icons

	import { tokenTarget } from '@src/services/token/token-target';
	import type { SeoWidgetData } from '.';
	import Button from '@components/ui/button.svelte';
	import Tabs from '@components/ui/tabs';
	import SeoAnalysisPanel from './components/seo-analysis-panel.svelte';
	import SeoField from './components/seo-field.svelte';
	// Components
	import SeoPreview from './components/seo-preview.svelte';
	import SocialPreview from './components/social-preview.svelte';
	// Logic
	import { analyzeSeo } from './seo-analyzer';
	import { collections } from '@src/stores/collection-store.svelte';
	import type { FieldInstance } from '@src/content/types';
	import type { SeoAnalysisResult } from './seo-types';
	import {
		buildPreviewUrl,
		isSeoPayload,
		normalizeSeoBindValue,
		parseFocusKeywords,
		readEntryBody,
		readLocalizedString,
		seoFeatureList
	} from './seo-serp';

	interface Props {
		field: FieldInstance;
		validationError?: string | null;
		value?: SeoWidgetData | Record<string, SeoWidgetData> | null;
	}

	let { field, value = $bindable(), validationError: _validationError }: Props = $props();

	// --- State ---
	let activeTab = $state<'basic' | 'social' | 'advanced'>('basic');
	let seoPreviewMobile = $state(false);
	let analysisResults: SeoAnalysisResult | null = $state(null);
	let showAnalysis = $state(false);
	let isAnalyzing = $state(false);

	// License State
	let licenseStatus = $state<{ active: boolean; daysRemaining: number | null; hasLicense: boolean }>({
		active: true,
		daysRemaining: null,
		hasLicense: false
	});
	let isCheckingLicense = $state(true);

	// Multi-language handling
	let availableLanguages = $state<string[]>([]);
	const lang = $derived(app.contentLanguage || 'en');
	// Flatten `{ en: payload }` (and double-wraps) onto the locale slot the form binds.
	$effect.pre(() => {
		if (!isSeoPayload(value)) {
			value = normalizeSeoBindValue(value, lang) as SeoWidgetData;
		}
	});
	const langData = $derived(
		(isSeoPayload(value) ? value : normalizeSeoBindValue(value, lang)) as SeoWidgetData
	);

	const enabledFeatures = $derived(new Set(seoFeatureList(field)));
	const hasFeature = (f: string) => enabledFeatures.has(f);

	const entrySlug = $derived(readLocalizedString(collections.activeValue?.slug, lang));
	const previewUrl = $derived(
		buildPreviewUrl(publicEnv.HOST_PROD || '', langData?.canonicalUrl || '', entrySlug)
	);
	const focusKeywords = $derived(parseFocusKeywords(langData?.focusKeyword || ''));
	const entryBody = $derived(readEntryBody(collections.activeValue));

	// Pre-compute translation percentages
	const translationStats = $derived.by(() => {
		if (!value || availableLanguages.length === 0) return {};
		const stats: Record<string, number> = {};
		const fields: Array<keyof SeoWidgetData> = ['title', 'description', 'focusKeyword', 'ogTitle', 'ogDescription', 'twitterTitle', 'twitterDescription', 'schemaMarkup'];

		const localeMap = value as Record<string, SeoWidgetData | undefined> | null;
		for (const f of fields) {
			const populated = availableLanguages.filter((l) => localeMap?.[l]?.[f]?.trim()).length;
			stats[f] = Math.round((populated / availableLanguages.length) * 100);
		}
		return stats;
	});

	// --- Lifecycle ---
	onMount(() => {
		if (!isSeoPayload(value)) {
			value = normalizeSeoBindValue(value, lang) as SeoWidgetData;
		}

		// Get available languages from config/store if possible
		if (publicEnv.AVAILABLE_CONTENT_LANGUAGES) {
			availableLanguages = [publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en', ...publicEnv.AVAILABLE_CONTENT_LANGUAGES];
		} else {
			availableLanguages = ['en'];
		}

		// Fetch License Status
		fetch('/api/system/license-status?type=widget&id=seo')
			.then((res) => res.json())
			.then((data) => {
				licenseStatus = data;
			})
			.catch((err) => {
				logger.error('Failed to check SEO license status:', err);
			})
			.finally(() => {
				isCheckingLicense = false;
			});
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
		void entryBody;

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

		try {
			analysisResults = await analyzeSeo(langData, entryBody);
		} catch (e) {
			logger.error('SEO Analysis failed', e);
		} finally {
			isAnalyzing = false;
		}
	}

	// --- Actions ---
	const updateField = (fieldName: keyof SeoWidgetData, newVal: string) => {
		if (!langData) return;
		if (fieldName === 'twitterCard') {
			if (newVal === 'summary' || newVal === 'summary_large_image') {
				langData.twitterCard = newVal;
			}
			return;
		}
		langData[fieldName] = newVal;
	};

	const isTranslated = $derived(!!field.translated);
	const placeholder = '{"@context": "https://schema.org", "@type": "Article", ...}';
</script>

<div class="@container relative space-y-4">
	{#if !isCheckingLicense}
		{#if !licenseStatus.hasLicense && licenseStatus.active && licenseStatus.daysRemaining !== null}
						<div class="flex items-center justify-between gap-3 rounded-lg border border-warning-500/30 bg-warning-500/10 p-3 text-warning-500 dark:bg-warning-900/20">
				<div class="flex items-center gap-2">
					<iconify-icon icon="mdi:clock-alert-outline" width="22" aria-hidden="true"></iconify-icon>
					<span class="text-sm"><strong>Premium trial active:</strong> {licenseStatus.daysRemaining} days left to try Social, Advanced, and Schema features.</span>
				</div>
				<Button variant="warning" href="https://marketplace.sveltycms.com" target="_blank" class="shrink-0 text-sm">Get License</Button>
			</div>
		{/if}
	{/if}
	<!-- Preview + Analysis — container query so it columns inside the form, not the viewport -->
	<div class="grid grid-cols-1 items-start gap-4 @min-[40rem]:grid-cols-2">
		<div class="min-w-0 rounded-lg border border-surface-500/30 bg-white/60 px-6 py-5 dark:border-surface-500/40 dark:bg-surface-900/50">
			<SeoPreview
				title={langData?.title || ''}
				description={langData?.description || ''}
				hostUrl={previewUrl}
				keywords={focusKeywords}
				bind:SeoPreviewToggle={seoPreviewMobile}
			/>
		</div>

		<div class="min-w-0">
			<SeoAnalysisPanel
				analysisResult={analysisResults}
				{isAnalyzing}
				bind:expanded={showAnalysis}
				content={entryBody}
				currentId={String(collections.activeValue?._id || '')}
				collectionId={String(collections.active?._id || '')}
			/>
		</div>
	</div>

	<!-- Bottom Area: Tabs & Inputs -->
	<div class="card relative overflow-hidden bg-white/50 px-6 py-5 dark:bg-surface-900/50 backdrop-blur-sm">

		{#if !isCheckingLicense && !licenseStatus.active}
						<div class="absolute inset-0 z-10 bg-surface-500/10 dark:bg-surface-900/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center pointer-events-none rounded-lg">
				<div class="card p-6 shadow-xl max-w-lg pointer-events-auto border border-error-500/30 bg-error-500/10 dark:bg-error-900/20">
					<iconify-icon icon="mdi:lock-outline" width="48" class="text-error-500 mb-4"></iconify-icon>
					<h3 class="h3 font-bold mb-2">Premium SEO Locked</h3>
					<p class="mb-4">Your 14-day trial has expired. To continue using the Social, Advanced, Schema, and AI features, please purchase a license.</p>
					<Button variant="error" href="https://marketplace.sveltycms.com" target="_blank" class="w-full">Purchase License</Button>
				</div>
			</div>
		{/if}

		<Tabs bind:value={activeTab} class="w-full">
			<Tabs.List class="mb-6 border-surface-500">
				<Tabs.Trigger value="basic">Basic</Tabs.Trigger>
				{#if hasFeature('social')}
					<Tabs.Trigger value="social" disabled={!isCheckingLicense && !licenseStatus.active}>Social</Tabs.Trigger>
				{/if}
				{#if hasFeature('advanced')}
					<Tabs.Trigger value="advanced" disabled={!isCheckingLicense && !licenseStatus.active}>Advanced</Tabs.Trigger>
				{/if}
			</Tabs.List>

			{#if langData}
				<Tabs.Content value="basic" class="mt-4 space-y-4">
					<p class="text-xs text-surface-400">These fields control the search snippet above. Canonical URL on the Advanced tab overrides the path shown in the preview.</p>
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<SeoField
						id="seo-title"
						label="SEO title"
						value={langData.title}
						{field}
						{lang}
						translated={isTranslated && availableLanguages.length > 1}
						translationPct={translationStats.title || 0}
						onUpdate={(v: string) => updateField('title', v)}
						maxLength={60}
						optimalMin={50}
						optimalMax={60}
						measureKind="title"
						placeholder="Page Title"
						hint="Aim for 50–60 characters. Put the focus keyword near the start."
					/>

					<SeoField
						id="seo-focusKeyword"
						label="Focus keyword"
						value={langData.focusKeyword}
						{field}
						{lang}
						translated={isTranslated && availableLanguages.length > 1}
						translationPct={translationStats.focusKeyword || 0}
						onUpdate={(v: string) => updateField('focusKeyword', v)}
						placeholder="Main keyword"
						hint="The phrase this page should rank for. Highlighted in the heatmap."
					/>
					</div>

					<SeoField
						id="seo-description"
						label="Meta description"
						type="textarea"
						value={langData.description}
						{field}
						{lang}
						translated={isTranslated && availableLanguages.length > 1}
						translationPct={translationStats.description || 0}
						onUpdate={(v: string) => updateField('description', v)}
						maxLength={160}
						optimalMin={150}
						optimalMax={160}
						measureKind="description"
						placeholder="Page Description"
						hint="Aim for 150–160 characters. Include a clear reason to click."
					/>
				</Tabs.Content>

				{#if hasFeature('social')}
				<Tabs.Content value="social" class="mt-4 space-y-4">
					<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
						<div class="space-y-4">
							<h3 class="h3 font-bold">Open Graph (Facebook/LinkedIn)</h3>

							<SeoField
								id="seo-ogTitle"
								label="OG Title"
								value={langData.ogTitle || ''}
								{field}
								{lang}
								translated={isTranslated && availableLanguages.length > 1}
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
								translated={isTranslated && availableLanguages.length > 1}
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
								translated={isTranslated && availableLanguages.length > 1}
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
								translated={isTranslated && availableLanguages.length > 1}
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
				</Tabs.Content>
				{/if}

				{#if hasFeature('advanced')}
				<Tabs.Content value="advanced" class="mt-4 space-y-4">

					<SeoField
						id="seo-robotsMeta"
						label="Robots Meta"
						value={langData.robotsMeta || ''}
						{field}
						{lang}
						translated={isTranslated && availableLanguages.length > 1}
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
						translated={isTranslated && availableLanguages.length > 1}
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
									<span class="font-medium text-tertiary-500 dark:text-primary-500">{lang.toUpperCase()}</span>
									<span class="font-medium text-surface-400 dark:text-surface-400">({translationStats.schemaMarkup || 0}%)</span>
								</div>
							{/if}
						</div>
						<div class="relative">
							<textarea aria-label="Schema.org JSON-LD"
								id="seo-schemaMarkup"
								class="textarea font-mono text-xs"
								rows="10"
								{placeholder}
								value={langData.schemaMarkup || ''}
								oninput={(e) => updateField('schemaMarkup', (e.currentTarget as HTMLTextAreaElement).value)}
								use:tokenTarget={{ name: field.db_fieldName, label: field.label, collection: field.collection }}
							></textarea>
						</div>
						<p class="text-xs text-surface-400 dark:text-surface-400">Paste valid JSON-LD structure here.</p>
					</div>
				</Tabs.Content>
				{/if}
			{/if}
		</Tabs>
	</div>
</div>
