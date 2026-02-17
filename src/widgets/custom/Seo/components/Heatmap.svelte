<!--
@file src/widgets/custom/Seo/components/Heatmap.svelte
@component
**Heatmap widget for SEO Widget to manage meta title, description, and robots meta tags**

@example
<Heatmap content={title + ' ' + description} language={$contentLanguage} keywords={seoKeywords} on:heatmapGenerated={handleHeatmapGenerated} />

#### Props
- `content` {string} - Content text
- `language` {string} - Content language
- `keywords` {string[]} - Array of keywords
- `on:heatmapGenerated` {function} - Heatmap data handler

#### Features
- Translatable
-->

<script lang="ts">
	import { debounce } from '@utils/utils';
	import { tick } from 'svelte';
	import { fade } from 'svelte/transition';

	interface HeatmapData {
		heatmapData: Array<{ word: string; heatLevel: number; isKeyword: boolean }>;
		keywordDensity: Record<string, number>;
	}

	interface Props {
		content?: string;
		keywords?: string[];
		language?: string;
		'on:heatmapGenerated'?: (data: HeatmapData) => void;
	}

	// Props with default values
	const { content = '', language = 'en', keywords = [], 'on:heatmapGenerated': onHeatmapGenerated = () => {} }: Props = $props();

	let heatmapData = $state<Array<{ word: string; heatLevel: number; isKeyword: boolean }>>([]);
	let keywordDensity = $state<Record<string, number>>({});

	// Use global debounce for content analysis
	const debouncedAnalysis = debounce.create(() => {
		generateHeatmap();
	}, 300);

	async function generateHeatmap() {
		if (!content) {
			heatmapData = [];
			keywordDensity = {};
			onHeatmapGenerated({ heatmapData, keywordDensity });
			return;
		}

		const words = content.split(/\s+/);

		heatmapData = words.map((word, index) => ({
			word,
			heatLevel: calculateHeatLevel(word, index, words.length, language),
			isKeyword: keywords.includes(word.toLowerCase())
		}));

		analyzeKeywordDensity(words);
		onHeatmapGenerated({ heatmapData, keywordDensity });
		await tick();
	}

	function calculateHeatLevel(word: string, index: number, totalWords: number, lang: string): number {
		let score = 0;

		// Position-based scoring
		const positionFactor = 1 - index / totalWords;
		score += positionFactor * 2;

		// Word length scoring (adjust for different languages)
		const idealLength = lang === 'en' ? 5 : 6;
		score += Math.max(0, 3 - Math.abs(word.length - idealLength));

		// Keyword bonus
		if (keywords.includes(word.toLowerCase())) {
			score += 2;
		}

		// Normalize score to 1-5 range
		return Math.max(1, Math.min(5, Math.round(score)));
	}

	function analyzeKeywordDensity(words: string[]) {
		const totalWords = words.length;
		const result: Record<string, number> = {};

		for (const keyword of keywords) {
			const count = words.filter((word) => word.toLowerCase() === keyword.toLowerCase()).length;
			result[keyword] = (count / totalWords) * 100;
		}

		keywordDensity = result;
	}

	function getHeatClasses(heatLevel: number): string {
		const heatMap = {
			1: 'bg-green-500/20',
			2: 'bg-yellow-500/20',
			3: 'bg-orange-500/20',
			4: 'bg-red-500/20',
			5: 'bg-purple-500/20'
		};
		return heatMap[heatLevel as keyof typeof heatMap] || '';
	}

	// Effect to handle content changes with debounced analysis
	$effect(() => {
		// React to content, language, or keywords changes
		void content;
		void language;
		void keywords;

		// Use the debounced analysis function
		debouncedAnalysis();
	});
</script>

<div class="wrap-break-word leading-6 max-sm:text-sm max-sm:leading-tight">
	{#if heatmapData.length > 0}
		{#each heatmapData as { word, heatLevel, isKeyword }, index (index)}
			<span
				class="relative cursor-help {getHeatClasses(heatLevel)} {isKeyword ? 'border-b-2 border-blue-500' : ''} group"
				aria-label="Heat level {heatLevel}: {word}{isKeyword ? ', keyword' : ''}"
				transition:fade={{ duration: 200 }}
			>
				{word}
				<span
					class="absolute bottom-full left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-800 p-1 text-xs text-white group-hover:block"
				>
					Heat: {heatLevel}, {isKeyword ? 'Keyword' : 'Regular word'}
				</span>
			</span>
		{/each}
	{:else}
		<p>No content available for heatmap.</p>
	{/if}
</div>

<div class="mt-5 text-sm max-sm:text-xs">
	<h4>Keyword Density</h4>
	{#if Object.keys(keywordDensity).length > 0}
		<ul>
			{#each Object.entries(keywordDensity) as [ keyword, density ] (keyword)}
				<li>{keyword}: {density.toFixed(2)}%</li>
			{/each}
		</ul>
	{:else}
		<p>No keywords provided or no matching keywords found in content.</p>
	{/if}
</div>
