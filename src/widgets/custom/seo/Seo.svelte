<!--
@file src/widgets/seo/Seo.svelte
@component
**Enterprise-level SEO widget with comprehensive analysis and optimization features**

@example
<Seo bind:value={value} />

#### Props
- `field`: FieldType
- `value`: any

#### Features
- Real-time SEO analysis and scoring
- Keyword density and prominence analysis
- Readability analysis (Flesch-Kincaid)
- Content structure optimization
- Social media preview
- SERP preview with rich snippets
- Enterprise-grade suggestions
- Translatable
-->

<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	// Stores
	import { collectionValue, mode } from '@root/src/stores/collectionStore.svelte';
	import { contentLanguage, validationStore } from '@stores/store.svelte';
	// Utils
	import { debounce, getFieldName } from '@utils/utils';
	// Skeleton
	import { Accordion, AccordionItem, ProgressRadial, Tab, TabGroup } from '@skeletonlabs/skeleton';
	// SEO Engine
	import { SeoAnalyzer } from './seoAnalyzer';
	import type {
		AiSeoSuggestion,
		SchemaMarkupObject,
		SeoAnalysisConfig,
		SeoAnalysisResult,
		SeoFeatureConfig,
		SeoState,
		SeoSuggestion
	} from './seoTypes';
	// Components
	import DescriptionInput from './DescriptionInput.svelte';
	import Heatmap from './Heatmap.svelte';
	import RobotsMetaInput from './RobotsMetaInput.svelte';
	import SeoPreview from './SeoPreview.svelte';
	import TitleInput from './TitleInput.svelte';

	interface Props {
		field: any;
		value?: any;
		features?: Partial<SeoFeatureConfig>; // Allow optional feature configuration
	}

	let { field, value = {}, features = {} }: Props = $props();

	// Default feature configuration - basic SEO is always enabled
	const defaultFeatures: SeoFeatureConfig = {
		basic: true, // Always enabled
		advanced: true,
		social: true,
		schema: true,
		ai: false, // Opt-in for AI features
		readability: true,
		keywords: true,
		preview: true
	};

	// Merge user preferences with defaults
	let enabledFeatures = $state<SeoFeatureConfig>({ ...defaultFeatures, ...features });

	const fieldName = getFieldName(field);
	value = value || collectionValue.value[fieldName] || {};

	// Core state using Svelte 5 runes
	let _data = $state<Record<string, SeoState>>(mode.value === 'create' ? {} : value);
	let _language = $state(field?.translated ? $contentLanguage : '');

	// SEO analysis state
	let analysisResult = $state<SeoAnalysisResult | null>(null);
	let isAnalyzing = $state(false);
	let analyzer: SeoAnalyzer | null = null;
	let aiSuggestions = $state<AiSeoSuggestion[]>([]);
	let generatedSchema = $state<SchemaMarkupObject | null>(null);

	// UI state
	let activeTab = $state(0);
	let showHeatmap = $state(false);
	let showSchemaGenerator = $state(false);

	// Initialize SEO state for current language
	$effect(() => {
		if (!_data[_language]) {
			_data[_language] = {
				title: '',
				description: '',
				keywords: [],
				focusKeyword: '',
				robotsMeta: 'index, follow',
				canonicalUrl: '',
				ogTitle: '',
				ogDescription: '',
				ogImage: '',
				twitterTitle: '',
				twitterDescription: '',
				twitterImage: '',
				twitterCard: 'summary_large_image',
				schemaMarkup: '',
				customMeta: []
			};
		}
	});

	// Derived reactive values leveraging Svelte 5
	let currentSeoData = $derived(
		_data[_language] || {
			title: '',
			description: '',
			keywords: [],
			focusKeyword: '',
			robotsMeta: 'index, follow',
			canonicalUrl: '',
			ogTitle: '',
			ogDescription: '',
			ogImage: '',
			twitterTitle: '',
			twitterDescription: '',
			twitterImage: '',
			twitterCard: 'summary_large_image',
			schemaMarkup: '',
			customMeta: []
		}
	);

	// Character width calculations (reactive)
	let titleCharacterWidth = $state(0);
	let descriptionCharacterWidth = $state(0);

	// Analysis configuration
	let analysisConfig = $derived<SeoAnalysisConfig>({
		focusKeyword: currentSeoData.focusKeyword || undefined,
		locale: 'en',
		contentLanguage: _language || 'en',
		targetAudience: 'general',
		contentType: 'article',
		enableRealTimeAnalysis: true,
		analysisDepth: 'comprehensive',
		enabledFeatures: enabledFeatures
	});

	// Validation state
	let validationError = $state<string | null>(null);
	let hostUrl = $state('');

	// Load default language if needed
	$effect(() => {
		if (!field?.translated && !_language) {
			_language = 'en'; // Default fallback
		}
	});

	// Initialize analyzer when config changes
	$effect(() => {
		if (analysisConfig) {
			analyzer = new SeoAnalyzer(analysisConfig);
		}
	});

	// Real-time analysis with debouncing
	// Debounced analysis function using the global debounce utility
	const debouncedAnalysis = debounce.create(async () => {
		if (!analyzer || isAnalyzing) return;

		isAnalyzing = true;
		try {
			const content = `${currentSeoData.title} ${currentSeoData.description}`;
			analysisResult = await analyzer.analyze(currentSeoData.title, currentSeoData.description, content, hostUrl);
		} catch (error) {
			console.error('SEO analysis failed:', error);
		} finally {
			isAnalyzing = false;
		}
	}, 300);

	// Trigger analysis when content changes
	$effect(() => {
		if (currentSeoData.title || currentSeoData.description || currentSeoData.focusKeyword) {
			debouncedAnalysis();
		}
	});

	onMount(() => {
		hostUrl = window.location.origin;
	});

	// Enhanced character width calculation
	function calculateCharacterWidth(text: string, fontSize: number, fontFamily: string): number {
		const span = document.createElement('span');
		span.style.fontSize = `${fontSize}px`;
		span.style.fontFamily = fontFamily;
		span.style.visibility = 'hidden';
		span.style.position = 'absolute';
		span.style.whiteSpace = 'nowrap';
		span.textContent = text;

		document.body.appendChild(span);
		const width = span.offsetWidth;
		document.body.removeChild(span);

		return width;
	}

	// Event handlers with enhanced Svelte 5 patterns
	const handleTitleChange = async (event: Event) => {
		const newTitle = (event.target as HTMLInputElement).value;
		_data[_language].title = newTitle;
		titleCharacterWidth = calculateCharacterWidth(newTitle, 16, 'Arial');
		validateSeo();
		await tick();
	};

	const handleDescriptionChange = async (event: Event) => {
		const newDescription = (event.target as HTMLInputElement).value;
		_data[_language].description = newDescription;
		descriptionCharacterWidth = calculateCharacterWidth(newDescription, 14, 'Arial');
		validateSeo();
		await tick();
	};

	const handleFocusKeywordChange = (event: Event) => {
		_data[_language].focusKeyword = (event.target as HTMLInputElement).value;
		validateSeo();
	};

	const handleKeywordsChange = (event: Event) => {
		const keywordsInput = (event.target as HTMLInputElement).value;
		_data[_language].keywords = keywordsInput
			.split(',')
			.map((k) => k.trim())
			.filter((k) => k.length > 0);
	};

	// Enhanced validation
	function validateSeo(): boolean {
		const errors: string[] = [];

		if (field?.required) {
			if (!currentSeoData.title) errors.push('Title is required');
			if (!currentSeoData.description) errors.push('Description is required');
		}

		if (currentSeoData.title && currentSeoData.title.length > 60) {
			errors.push('Title is too long');
		}

		if (currentSeoData.description && currentSeoData.description.length > 160) {
			errors.push('Description is too long');
		}

		validationError = errors.length > 0 ? errors.join(', ') : null;

		if (validationError) {
			validationStore.setError(fieldName, validationError);
		} else {
			validationStore.clearError(fieldName);
		}

		return !validationError;
	}

	function applySuggestionFix(suggestion: SeoSuggestion) {
		// Implementation would depend on suggestion type
		console.log('Applying fix for:', suggestion.title);
	}

	// AI-powered schema generation
	async function generateSchemaMarkup(contentType: string = 'Article'): Promise<SchemaMarkupObject> {
		const baseSchema: SchemaMarkupObject = {
			'@context': 'https://schema.org',
			'@type': contentType as any,
			headline: currentSeoData.title,
			description: currentSeoData.description,
			name: currentSeoData.title,
			url: `${hostUrl}${window.location.pathname}`,
			datePublished: new Date().toISOString(),
			dateModified: new Date().toISOString(),
			author: {
				'@type': 'Person',
				name: 'Author Name' // This could be pulled from user context
			},
			publisher: {
				'@type': 'Organization',
				name: 'Site Name', // This could be pulled from site settings
				logo: {
					'@type': 'ImageObject',
					url: `${hostUrl}/logo.png`
				}
			}
		};

		// Add keywords if available
		if (currentSeoData.keywords.length > 0) {
			baseSchema.keywords = currentSeoData.keywords;
		}

		// Add focus keyword for better SEO
		if (currentSeoData.focusKeyword) {
			baseSchema.keywords = baseSchema.keywords || [];
			if (!baseSchema.keywords.includes(currentSeoData.focusKeyword)) {
				baseSchema.keywords.push(currentSeoData.focusKeyword);
			}
		}

		return baseSchema;
	}

	// Auto-generate schema based on content analysis
	async function autoGenerateSchema() {
		if (!enabledFeatures.schema && !enabledFeatures.ai) return;

		try {
			const schema = await generateSchemaMarkup();
			generatedSchema = schema;

			// Update the schema markup in the SEO data
			_data[_language].schemaMarkup = JSON.stringify(schema, null, 2);
		} catch (error) {
			console.error('Schema generation failed:', error);
		}
	}

	// AI-powered content optimization (placeholder for future AI integration)
	async function optimizeWithAI() {
		if (!enabledFeatures.ai) return;

		// This would integrate with AI services like OpenAI, Claude, etc.
		const aiSuggestion: AiSeoSuggestion = {
			id: Date.now().toString(),
			type: 'info',
			category: 'content',
			title: 'AI Content Optimization',
			description: 'AI analysis suggests improvements to your content structure and keyword usage.',
			impact: 'high',
			effort: 'medium',
			priority: 90,
			actionable: true,
			aiGenerated: true,
			confidence: 0.85,
			reasoning: 'Based on content analysis and best practices',
			fix: 'Consider restructuring your content to include more semantic keywords and improve readability.',
			contentOptimization: {
				originalText: currentSeoData.title,
				optimizedText: `${currentSeoData.title} - Enhanced for ${currentSeoData.focusKeyword}`,
				improvements: ['Added focus keyword to title', 'Improved title structure', 'Enhanced semantic relevance']
			}
		};

		aiSuggestions = [aiSuggestion];
	}

	// Heatmap event handler
	function handleHeatmapGenerated(data: { heatmapData: unknown; keywordDensity: unknown }) {
		console.log('Heatmap data:', data);
	}

	// Social media handlers
	const updateSocialMeta = (platform: 'og' | 'twitter', field: string, value: string) => {
		if (platform === 'og') {
			switch (field) {
				case 'title':
					_data[_language].ogTitle = value;
					break;
				case 'description':
					_data[_language].ogDescription = value;
					break;
				case 'image':
					_data[_language].ogImage = value;
					break;
			}
		} else {
			switch (field) {
				case 'title':
					_data[_language].twitterTitle = value;
					break;
				case 'description':
					_data[_language].twitterDescription = value;
					break;
				case 'image':
					_data[_language].twitterImage = value;
					break;
				case 'card':
					_data[_language].twitterCard = value;
					break;
			}
		}
	};

	// Export WidgetData for data binding with Fields.svelte
	export const WidgetData = async () => _data;

	// Score colors for visual feedback
	const getScoreColor = (score: number): string => {
		if (score >= 80) return 'text-success-500';
		if (score >= 60) return 'text-warning-500';
		return 'text-error-500';
	};

	const getScoreBadgeVariant = (score: number): string => {
		if (score >= 80) return 'variant-filled-success';
		if (score >= 60) return 'variant-filled-warning';
		return 'variant-filled-error';
	};
</script>

<div class="seo-container relative mb-4">
	<!-- Header with overall score -->
	<div class="bg-surface-100-800-token mb-4 rounded-lg p-4">
		<div class="flex items-center justify-between">
			<h2 class="text-xl font-semibold">SEO Optimization</h2>
			{#if analysisResult}
				<div class="flex items-center gap-4">
					<div class="text-center">
						<ProgressRadial
							value={analysisResult.score.overall}
							stroke={60}
							meter="stroke-primary-500"
							width="w-16"
							class={getScoreColor(analysisResult.score.overall)}
						>
							{analysisResult.score.overall}
						</ProgressRadial>
						<div class="mt-1 text-xs">Overall</div>
					</div>

					{#if isAnalyzing}
						<div class="animate-pulse">
							<iconify-icon icon="line-md:loading-loop" width="24"></iconify-icon>
							Analyzing...
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Score breakdown -->
		{#if analysisResult}
			<div class="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5" transition:slide>
				<div class="text-center">
					<div class="text-2xl font-bold {getScoreColor(analysisResult.score.content)}">{analysisResult.score.content}</div>
					<div class="text-xs">Content</div>
				</div>
				<div class="text-center">
					<div class="text-2xl font-bold {getScoreColor(analysisResult.score.technical)}">{analysisResult.score.technical}</div>
					<div class="text-xs">Technical</div>
				</div>
				<div class="text-center">
					<div class="text-2xl font-bold {getScoreColor(analysisResult.score.readability)}">{analysisResult.score.readability}</div>
					<div class="text-xs">Readability</div>
				</div>
				<div class="text-center">
					<div class="text-2xl font-bold {getScoreColor(analysisResult.score.keywords)}">{analysisResult.score.keywords}</div>
					<div class="text-xs">Keywords</div>
				</div>
				<div class="text-center">
					<div class="text-2xl font-bold {getScoreColor(analysisResult.score.social)}">{analysisResult.score.social}</div>
					<div class="text-xs">Social</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Tabbed interface -->
	<TabGroup>
		<Tab bind:group={activeTab} name="basic" value={0}>Basic SEO</Tab>
		{#if enabledFeatures.advanced}
			<Tab bind:group={activeTab} name="advanced" value={1}>Advanced</Tab>
		{/if}
		{#if enabledFeatures.social}
			<Tab bind:group={activeTab} name="social" value={2}>Social Media</Tab>
		{/if}
		{#if enabledFeatures.schema || enabledFeatures.ai}
			<Tab bind:group={activeTab} name="schema" value={3}>Schema & AI</Tab>
		{/if}
		{#if enabledFeatures.readability || enabledFeatures.keywords}
			<Tab bind:group={activeTab} name="analysis" value={4}>Analysis</Tab>
		{/if}
		{#if enabledFeatures.preview}
			<Tab bind:group={activeTab} name="preview" value={5}>Preview</Tab>
		{/if}

		<!-- Basic SEO Tab -->
		<svelte:fragment slot="panel">
			{#if activeTab === 0}
				<div class="space-y-4" transition:fade>
					<!-- Focus Keyword -->
					<div class="input-container">
						<label for="focus-keyword" class="label">
							<span class="text-token">Focus Keyword</span>
						</label>
						<input
							id="focus-keyword"
							type="text"
							class="input"
							placeholder="Enter your main keyword"
							bind:value={currentSeoData.focusKeyword}
							oninput={handleFocusKeywordChange}
						/>
					</div>

					<!-- Title -->
					<div class="input-container">
						<TitleInput title={currentSeoData.title} {titleCharacterWidth} {handleTitleChange} />
					</div>

					<!-- Description -->
					<div class="input-container">
						<DescriptionInput description={currentSeoData.description} {descriptionCharacterWidth} {handleDescriptionChange} />
					</div>

					<!-- Keywords -->
					<div class="input-container">
						<label for="keywords" class="label">
							<span class="text-token">Keywords (comma-separated)</span>
						</label>
						<input
							id="keywords"
							type="text"
							class="input"
							placeholder="keyword1, keyword2, keyword3"
							value={currentSeoData.keywords.join(', ')}
							oninput={handleKeywordsChange}
						/>
					</div>

					<!-- Robots Meta -->
					<div class="input-container">
						<RobotsMetaInput bind:value={currentSeoData.robotsMeta} />
					</div>
				</div>
			{/if}

			<!-- Advanced Tab -->
			{#if activeTab === 1 && enabledFeatures.advanced}
				<div class="space-y-4" transition:fade>
					<!-- Canonical URL -->
					<div class="input-container">
						<label for="canonical-url" class="label">
							<span class="text-token">Canonical URL</span>
						</label>
						<input id="canonical-url" type="url" class="input" placeholder="https://example.com/page" bind:value={currentSeoData.canonicalUrl} />
					</div>

					<!-- Schema Markup -->
					<div class="input-container">
						<label for="schema-markup" class="label">
							<span class="text-token">Schema Markup (JSON-LD)</span>
						</label>
						<textarea id="schema-markup" class="textarea" rows="6" placeholder="Enter JSON-LD schema markup" bind:value={currentSeoData.schemaMarkup}
						></textarea>
					</div>

					<!-- Custom Meta Tags -->
					<div class="input-container">
						<fieldset class="border-0 p-0">
							<legend class="label mb-2">
								<span class="text-token">Custom Meta Tags</span>
							</legend>
							{#each currentSeoData.customMeta as meta, index}
								<div class="mb-2 flex gap-2">
									<input type="text" class="input flex-1" placeholder="Name/Property" aria-label="Meta tag name or property" bind:value={meta.name} />
									<input type="text" class="input flex-1" placeholder="Content" aria-label="Meta tag content" bind:value={meta.content} />
									<button
										class="variant-filled-error btn btn-sm"
										aria-label="Remove meta tag"
										onclick={() => currentSeoData.customMeta.splice(index, 1)}
									>
										Remove
									</button>
								</div>
							{/each}
							<button class="variant-filled-secondary btn btn-sm" onclick={() => currentSeoData.customMeta.push({ name: '', content: '' })}>
								Add Meta Tag
							</button>
						</fieldset>
					</div>
				</div>
			{/if}

			<!-- Social Media Tab -->
			{#if activeTab === 2 && enabledFeatures.social}
				<div class="space-y-6" transition:fade>
					<!-- Open Graph -->
					<div class="card p-4">
						<h3 class="h3 mb-4">Open Graph (Facebook)</h3>
						<div class="space-y-3">
							<input
								type="text"
								class="input"
								placeholder="OG Title"
								bind:value={currentSeoData.ogTitle}
								oninput={(e) => updateSocialMeta('og', 'title', (e.target as HTMLInputElement).value)}
							/>
							<textarea
								class="textarea"
								placeholder="OG Description"
								bind:value={currentSeoData.ogDescription}
								oninput={(e) => updateSocialMeta('og', 'description', (e.target as HTMLTextAreaElement).value)}
							></textarea>
							<input
								type="url"
								class="input"
								placeholder="OG Image URL"
								bind:value={currentSeoData.ogImage}
								oninput={(e) => updateSocialMeta('og', 'image', (e.target as HTMLInputElement).value)}
							/>
						</div>
					</div>

					<!-- Twitter -->
					<div class="card p-4">
						<h3 class="h3 mb-4">Twitter Card</h3>
						<div class="space-y-3">
							<select class="select" bind:value={currentSeoData.twitterCard}>
								<option value="summary">Summary</option>
								<option value="summary_large_image">Summary Large Image</option>
								<option value="app">App</option>
								<option value="player">Player</option>
							</select>
							<input
								type="text"
								class="input"
								placeholder="Twitter Title"
								bind:value={currentSeoData.twitterTitle}
								oninput={(e) => updateSocialMeta('twitter', 'title', (e.target as HTMLInputElement).value)}
							/>
							<textarea
								class="textarea"
								placeholder="Twitter Description"
								bind:value={currentSeoData.twitterDescription}
								oninput={(e) => updateSocialMeta('twitter', 'description', (e.target as HTMLTextAreaElement).value)}
							></textarea>
							<input
								type="url"
								class="input"
								placeholder="Twitter Image URL"
								bind:value={currentSeoData.twitterImage}
								oninput={(e) => updateSocialMeta('twitter', 'image', (e.target as HTMLInputElement).value)}
							/>
						</div>
					</div>
				</div>
			{/if}

			<!-- Schema & AI Tab -->
			{#if activeTab === 3 && (enabledFeatures.schema || enabledFeatures.ai)}
				<div class="space-y-4" transition:fade>
					{#if enabledFeatures.schema}
						<!-- Schema Markup Generator -->
						<div class="card p-4">
							<div class="mb-4 flex items-center justify-between">
								<h3 class="h3">JSON-LD Schema Markup</h3>
								<div class="flex gap-2">
									<button class="variant-filled-secondary btn btn-sm" onclick={autoGenerateSchema}> Auto Generate </button>
									<button class="variant-filled-tertiary btn btn-sm" onclick={() => (showSchemaGenerator = !showSchemaGenerator)}>
										{showSchemaGenerator ? 'Hide' : 'Show'} Editor
									</button>
								</div>
							</div>

							{#if showSchemaGenerator}
								<div class="space-y-3" transition:slide>
									<!-- Schema Type Selector -->
									<div>
										<label for="schema-type" class="label">
											<span class="text-token">Schema Type</span>
										</label>
										<select id="schema-type" class="select">
											<option value="Article">Article</option>
											<option value="BlogPosting">Blog Post</option>
											<option value="NewsArticle">News Article</option>
											<option value="Product">Product</option>
											<option value="Service">Service</option>
											<option value="Organization">Organization</option>
											<option value="Event">Event</option>
											<option value="FAQ">FAQ</option>
											<option value="HowTo">How-To</option>
											<option value="Recipe">Recipe</option>
										</select>
									</div>

									<!-- Generated Schema Preview -->
									{#if generatedSchema}
										<div class="bg-surface-200-700-token rounded p-3">
											<h4 class="h4 mb-2">Generated Schema:</h4>
											<pre class="max-h-40 overflow-auto text-xs">{JSON.stringify(generatedSchema, null, 2)}</pre>
										</div>
									{/if}
								</div>
							{/if}

							<!-- Manual Schema Editor -->
							<div class="mt-4">
								<label for="schema-markup" class="label">
									<span class="text-token">Schema Markup (JSON-LD)</span>
								</label>
								<textarea
									id="schema-markup"
									class="textarea font-mono text-sm"
									rows="8"
									placeholder="Enter JSON-LD schema markup or use auto-generate"
									bind:value={currentSeoData.schemaMarkup}
								></textarea>
							</div>
						</div>
					{/if}

					{#if enabledFeatures.ai}
						<!-- AI-Powered Optimization -->
						<div class="card p-4">
							<div class="mb-4 flex items-center justify-between">
								<h3 class="h3">AI SEO Optimization</h3>
								<button class="variant-filled-primary btn btn-sm" onclick={optimizeWithAI}>
									<iconify-icon icon="mdi:robot" width="16"></iconify-icon>
									Optimize with AI
								</button>
							</div>

							{#if aiSuggestions.length > 0}
								<div class="space-y-3">
									{#each aiSuggestions as suggestion}
										<div class="bg-surface-100-800-token rounded-lg border p-3">
											<div class="mb-2 flex items-start justify-between">
												<div class="flex items-center gap-2">
													<iconify-icon icon="mdi:robot" width="16" class="text-primary-500"></iconify-icon>
													<h4 class="font-semibold">{suggestion.title}</h4>
													<span class="variant-filled-primary badge text-xs">
														AI · {Math.round(suggestion.confidence * 100)}%
													</span>
												</div>
											</div>
											<p class="mb-2 text-sm">{suggestion.description}</p>
											<p class="text-surface-600-300-token mb-3 text-xs">{suggestion.reasoning}</p>

											{#if suggestion.contentOptimization}
												<div class="bg-surface-200-700-token mb-3 rounded p-3">
													<h5 class="mb-2 text-sm font-semibold">Content Optimization:</h5>
													<div class="text-xs">
														<div class="mb-1"><strong>Original:</strong> {suggestion.contentOptimization.originalText}</div>
														<div class="mb-2"><strong>Optimized:</strong> {suggestion.contentOptimization.optimizedText}</div>
														<div>
															<strong>Improvements:</strong>
															<ul class="mt-1 list-inside list-disc">
																{#each suggestion.contentOptimization.improvements as improvement}
																	<li>{improvement}</li>
																{/each}
															</ul>
														</div>
													</div>
												</div>
											{/if}

											{#if suggestion.actionable}
												<button class="variant-filled-primary btn btn-sm" onclick={() => applySuggestionFix(suggestion)}> Apply Suggestion </button>
											{/if}
										</div>
									{/each}
								</div>
							{:else}
								<div class="py-6 text-center text-surface-500">
									<iconify-icon icon="mdi:robot" width="48" class="mb-2"></iconify-icon>
									<p>Click "Optimize with AI" to get personalized suggestions</p>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Analysis Tab -->
			{#if activeTab === 4 && (enabledFeatures.readability || enabledFeatures.keywords)}
				<div class="space-y-4" transition:fade>
					{#if analysisResult}
						<!-- Suggestions -->
						<div class="card p-4">
							<h3 class="h3 mb-4">SEO Recommendations</h3>
							{#if analysisResult.suggestions.length > 0}
								<Accordion>
									{#each analysisResult.suggestions as suggestion}
										<AccordionItem>
											<svelte:fragment slot="summary">
												<div class="flex items-center gap-3">
													<span class="badge {getScoreBadgeVariant(suggestion.priority)}">
														{suggestion.impact.toUpperCase()}
													</span>
													<span class="text-sm">{suggestion.title}</span>
												</div>
											</svelte:fragment>
											<svelte:fragment slot="content">
												<p class="mb-3">{suggestion.description}</p>
												{#if suggestion.fix}
													<div class="bg-surface-200-700-token mb-3 rounded p-3">
														<strong>How to fix:</strong>
														{suggestion.fix}
													</div>
												{/if}
												{#if suggestion.actionable}
													<button class="variant-filled-primary btn btn-sm" onclick={() => applySuggestionFix(suggestion)}> Apply Fix </button>
												{/if}
											</svelte:fragment>
										</AccordionItem>
									{/each}
								</Accordion>
							{:else}
								<p class="text-center text-surface-500">All SEO checks passed! 🎉</p>
							{/if}
						</div>

						<!-- Readability Analysis -->
						<div class="card p-4">
							<h3 class="h3 mb-4">Readability Analysis</h3>
							<div class="grid grid-cols-2 gap-4 md:grid-cols-4">
								<div class="text-center">
									<div class="text-2xl font-bold">{analysisResult.readability.fleschKincaidScore.toFixed(1)}</div>
									<div class="text-xs">Flesch-Kincaid</div>
								</div>
								<div class="text-center">
									<div class="text-2xl font-bold">{analysisResult.readability.readingTime}</div>
									<div class="text-xs">Minutes to Read</div>
								</div>
								<div class="text-center">
									<div class="text-2xl font-bold">{analysisResult.readability.wordCount}</div>
									<div class="text-xs">Word Count</div>
								</div>
								<div class="text-center">
									<div class="text-2xl font-bold">{analysisResult.readability.passiveVoicePercentage.toFixed(1)}%</div>
									<div class="text-xs">Passive Voice</div>
								</div>
							</div>
						</div>

						<!-- Keyword Analysis -->
						{#if analysisResult.keywords.length > 0}
							<div class="card p-4">
								<h3 class="h3 mb-4">Keyword Analysis</h3>
								{#each analysisResult.keywords as keywordData}
									<div class="mb-4">
										<h4 class="h4 mb-2">"{keywordData.focusKeyword}"</h4>
										<div class="grid grid-cols-2 gap-4 md:grid-cols-4">
											<div class="text-center">
												<div class="text-2xl font-bold">{keywordData.density.toFixed(1)}%</div>
												<div class="text-xs">Density</div>
											</div>
											<div class="text-center">
												<div class="text-2xl font-bold">{keywordData.prominence}</div>
												<div class="text-xs">Prominence</div>
											</div>
											<div class="text-center">
												<div class="text-2xl font-bold {keywordData.inTitle ? 'text-success-500' : 'text-error-500'}">
													{keywordData.inTitle ? '✓' : '✗'}
												</div>
												<div class="text-xs">In Title</div>
											</div>
											<div class="text-center">
												<div class="text-2xl font-bold {keywordData.inDescription ? 'text-success-500' : 'text-error-500'}">
													{keywordData.inDescription ? '✓' : '✗'}
												</div>
												<div class="text-xs">In Description</div>
											</div>
										</div>
									</div>
								{/each}
							</div>
						{/if}

						<!-- Heatmap Toggle -->
						<div class="card p-4">
							<div class="mb-4 flex items-center justify-between">
								<h3 class="h3">Content Heatmap</h3>
								<button class="variant-filled-secondary btn btn-sm" onclick={() => (showHeatmap = !showHeatmap)}>
									{showHeatmap ? 'Hide' : 'Show'} Heatmap
								</button>
							</div>

							{#if showHeatmap}
								<div transition:slide>
									<Heatmap
										content={currentSeoData.title + ' ' + currentSeoData.description}
										language={_language}
										keywords={currentSeoData.keywords}
										{...{ 'on:heatmapGenerated': handleHeatmapGenerated }}
									/>
								</div>
							{/if}
						</div>
					{:else}
						<div class="py-8 text-center">
							<p>Enter some content to see analysis results</p>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Preview Tab -->
			{#if activeTab === 5 && enabledFeatures.preview}
				<div class="space-y-4" transition:fade>
					<SeoPreview
						title={currentSeoData.title}
						description={currentSeoData.description}
						{hostUrl}
						SeoPreviewToggle={false}
						ontogglePreview={() => {}}
					/>

					{#if analysisResult?.social}
						<!-- Facebook Preview -->
						<div class="card p-4">
							<h3 class="h3 mb-4">Facebook Preview</h3>
							<div class="bg-surface-50-900-token rounded-lg border p-4">
								<div class="flex items-start gap-3">
									<div class="bg-surface-300-600-token h-16 w-16 rounded"></div>
									<div class="flex-1">
										<div class="font-semibold text-primary-500">
											{analysisResult.social.facebook.title || currentSeoData.title}
										</div>
										<div class="text-surface-600-300-token text-sm">
											{analysisResult.social.facebook.description || currentSeoData.description}
										</div>
										<div class="mt-1 text-xs text-surface-500">{hostUrl}</div>
									</div>
								</div>
							</div>
						</div>

						<!-- Twitter Preview -->
						<div class="card p-4">
							<h3 class="h3 mb-4">Twitter Preview</h3>
							<div class="bg-surface-50-900-token max-w-md rounded-lg border p-4">
								<div class="bg-surface-300-600-token mb-3 h-32 w-full rounded"></div>
								<div class="font-semibold">
									{analysisResult.social.twitter.title || currentSeoData.title}
								</div>
								<div class="text-surface-600-300-token mb-2 text-sm">
									{analysisResult.social.twitter.description || currentSeoData.description}
								</div>
								<div class="text-xs text-surface-500">{hostUrl}</div>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</svelte:fragment>
	</TabGroup>

	<!-- Error Message -->
	{#if validationError}
		<div class="alert variant-filled-error mt-4" transition:slide>
			<iconify-icon icon="mdi:alert-circle" width="20"></iconify-icon>
			<span>{validationError}</span>
		</div>
	{/if}
</div>

<style lang="postcss">
	.seo-container {
		@apply space-y-4;
	}

	.input-container {
		@apply space-y-2;
		min-height: 2.5rem;
	}

	/* Enhanced score visualization */
	:global(.progress-radial-text) {
		@apply text-lg font-bold;
	}

	/* Tab styling improvements */
	:global(.tab-group) {
		@apply border-surface-300-600-token border-b;
	}

	:global(.tab) {
		@apply rounded-t-lg px-4 py-2 transition-colors;
	}

	:global(.tab[aria-selected='true']) {
		@apply bg-primary-500 text-white;
	}

	/* Card enhancements */
	.card {
		@apply bg-surface-100-800-token border-surface-300-600-token rounded-lg border;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	/* Suggestion priority indicators */
	.suggestion-item {
		@apply rounded-lg border-l-4 p-3;
	}

	.suggestion-high {
		@apply border-l-error-500 bg-error-50;
	}

	.suggestion-medium {
		@apply border-l-warning-500 bg-warning-50;
	}

	.suggestion-low {
		@apply border-l-success-500 bg-success-50;
	}

	/* Enhanced heatmap container */
	.heatmap-container {
		@apply bg-surface-50-900-token rounded-lg border p-4;
	}

	/* Analysis metrics grid */
	.metrics-grid {
		@apply grid gap-4;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
	}

	.metric-item {
		@apply bg-surface-100-800-token rounded-lg p-3 text-center;
	}

	.metric-value {
		@apply mb-1 text-2xl font-bold;
	}

	.metric-label {
		@apply text-surface-600-300-token text-xs;
	}

	/* Responsive improvements */
	@media (max-width: 768px) {
		.seo-container {
			@apply text-sm;
		}

		.metrics-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		:global(.tab-group .tab) {
			@apply px-2 py-1 text-sm;
		}
	}

	/* Accessibility enhancements */
	:global(.tab:focus),
	:global(.btn:focus) {
		@apply outline-none ring-2 ring-primary-500 ring-offset-2;
	}

	/* Animation improvements */
	.fade-in {
		animation: fadeIn 0.3s ease-in-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Loading states */
	.analyzing {
		@apply pointer-events-none opacity-70;
	}

	.pulse {
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}
</style>
