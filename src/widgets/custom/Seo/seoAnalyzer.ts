/**
 * @file src/widgets/custom/Seo/seoAnalyzer.ts
 * @description SEO analysis engine
 */

import type {
	ContentStructure,
	KeywordAnalysis,
	ReadabilityAnalysis,
	SeoAnalysisConfig,
	SeoAnalysisResult,
	SeoScore,
	SeoSuggestion,
	TechnicalSeo
} from './seoTypes';

export class SeoAnalyzer {
	private config: SeoAnalysisConfig;
	private stopWords: Set<string>;
	private transitionWords: Set<string>;

	/**
	 * Robustly remove all <script> tags and their content from input string.
	 * Applies replacements repeatedly until no more script tags can be found,
	 * preventing bypass via malformed or nested tags.
	 */
	private removeScriptTags(input: string): string {
		let previous: string;
		do {
			previous = input;
			// Remove <script>...</script> blocks (with any whitespace/attributes)
			input = input.replace(/<script[\s\S]*?>[\s\S]*?<\/script\s*>/gi, '');
			// Remove standalone/orphaned <script> opening tags
			input = input.replace(/<script[^>]*>/gi, '');
		} while (input !== previous);
		return input;
	}

	constructor(config: SeoAnalysisConfig) {
		this.config = config;
		this.stopWords = new Set([
			'a',
			'an',
			'and',
			'are',
			'as',
			'at',
			'be',
			'by',
			'for',
			'from',
			'has',
			'he',
			'in',
			'is',
			'it',
			'its',
			'of',
			'on',
			'that',
			'the',
			'to',
			'was',
			'will',
			'with',
			'would',
			'could',
			'should',
			'may',
			'might',
			'can',
			'shall',
			'must',
			'ought',
			'need',
			'dare'
		]);
		this.transitionWords = new Set([
			'however',
			'therefore',
			'furthermore',
			'moreover',
			'additionally',
			'consequently',
			'meanwhile',
			'nevertheless',
			'nonetheless',
			'alternatively',
			'similarly',
			'likewise',
			'conversely',
			'in contrast',
			'on the other hand',
			'in addition',
			'as a result',
			'for example',
			'for instance',
			'in particular',
			'specifically',
			'namely',
			'that is',
			'in other words',
			'to clarify',
			'to summarize',
			'in conclusion',
			'finally',
			'ultimately',
			'overall'
		]);
	}

	async analyze(title: string, description: string, content: string, url?: string): Promise<SeoAnalysisResult> {
		const startTime = performance.now();

		const [keywords, readability, contentStructure, technical] = await Promise.all([
			this.analyzeKeywords(title, description, content),
			this.analyzeReadability(content),
			this.analyzeContentStructure(content),
			this.analyzeTechnical(title, description, url)
		]);

		const score = this.calculateOverallScore(keywords, readability, contentStructure, technical);
		const suggestions = this.generateSuggestions(keywords, readability, contentStructure, technical);

		const analysisTime = performance.now() - startTime;

		return {
			score,
			keywords,
			readability,
			contentStructure,
			technical,
			social: {
				facebook: {
					title: title.substring(0, 60),
					description: description.substring(0, 155),
					image: '',
					type: 'article'
				},
				twitter: {
					title: title.substring(0, 70),
					description: description.substring(0, 200),
					image: '',
					card: 'summary_large_image'
				},
				linkedin: {
					title: title.substring(0, 60),
					description: description.substring(0, 155),
					image: ''
				}
			},
			suggestions,
			serpPreview: {
				title: title.substring(0, 60),
				description: description.substring(0, 160),
				url: url || '',
				breadcrumbs: this.extractBreadcrumbs(url)
			},
			lastAnalyzed: new Date(),
			analysisTime
		};
	}

	private async analyzeKeywords(title: string, description: string, content: string): Promise<KeywordAnalysis[]> {
		if (!this.config.focusKeyword) return [];

		const keyword = this.config.focusKeyword.toLowerCase();
		const words = this.tokenize(content.toLowerCase());
		const totalWords = words.length;

		const keywordOccurrences = words.filter((word) => word === keyword).length;
		const density = (keywordOccurrences / totalWords) * 100;

		// Find first occurrence position
		const firstOccurrence = words.indexOf(keyword);
		const firstOccurrencePercentage = firstOccurrence !== -1 ? (firstOccurrence / totalWords) * 100 : -1;

		// Check prominence
		const inTitle = title.toLowerCase().includes(keyword);
		const inDescription = description.toLowerCase().includes(keyword);

		// Analyze distribution
		const third = Math.floor(totalWords / 3);
		const beginningOccurrences = words.slice(0, third).filter((word) => word === keyword).length;
		const middleOccurrences = words.slice(third, third * 2).filter((word) => word === keyword).length;
		const endOccurrences = words.slice(third * 2).filter((word) => word === keyword).length;

		return [
			{
				focusKeyword: keyword,
				density,
				prominence: this.calculateKeywordProminence(inTitle, inDescription, firstOccurrencePercentage),
				firstOccurrence: firstOccurrencePercentage,
				inTitle,
				inDescription,
				inUrl: false, // Would need URL analysis
				inHeadings: this.findKeywordInHeadings(content, keyword),
				variations: this.findKeywordVariations(content, keyword),
				distribution: {
					beginning: (beginningOccurrences / keywordOccurrences) * 100 || 0,
					middle: (middleOccurrences / keywordOccurrences) * 100 || 0,
					end: (endOccurrences / keywordOccurrences) * 100 || 0
				}
			}
		];
	}

	private analyzeReadability(content: string): ReadabilityAnalysis {
		const sentences = this.splitIntoSentences(content);
		const words = this.tokenize(content);
		const syllables = this.countSyllables(content);

		const averageWordsPerSentence = words.length / sentences.length;
		const averageSyllablesPerWord = syllables / words.length;

		// Flesch-Kincaid Reading Ease Score
		const fleschKincaidScore = 206.835 - 1.015 * averageWordsPerSentence - 84.6 * averageSyllablesPerWord;

		// Passive voice detection
		const passiveVoiceSentences = this.detectPassiveVoice(sentences);
		const passiveVoicePercentage = (passiveVoiceSentences.length / sentences.length) * 100;

		// Complex sentences (more than 20 words)
		const complexSentences = sentences.filter((sentence) => this.tokenize(sentence).length > 20).length;

		// Transition words
		const transitionWordCount = this.countTransitionWords(content);

		// Reading time (average 200 words per minute)
		const readingTime = Math.ceil(words.length / 200);

		return {
			fleschKincaidScore,
			readingLevel: this.getReadingLevel(fleschKincaidScore),
			averageSentenceLength: averageWordsPerSentence,
			averageWordsPerSentence,
			passiveVoicePercentage,
			sentencesWithPassiveVoice: passiveVoiceSentences.length,
			complexSentences,
			transitionWords: transitionWordCount,
			readingTime,
			wordCount: words.length,
			sentenceCount: sentences.length,
			paragraphCount: content.split('\n\n').filter((p) => p.trim().length > 0).length
		};
	}

	private analyzeContentStructure(content: string): ContentStructure {
		const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
		const headings = {
			h1: [] as string[],
			h2: [] as string[],
			h3: [] as string[],
			h4: [] as string[],
			h5: [] as string[],
			h6: [] as string[]
		};

		let match;
		while ((match = headingRegex.exec(content)) !== null) {
			const level = parseInt(match[1]) as 1 | 2 | 3 | 4 | 5 | 6;
			const text = this.removeScriptTags(match[2])
				.replace(/<[^>]*>/g, '') // Remove other HTML tags
				.trim();
			headings[`h${level}` as keyof typeof headings].push(text);
		}

		const hasH1 = headings.h1.length > 0;
		const multipleH1 = headings.h1.length > 1;

		// Check heading hierarchy
		const headingHierarchy = this.checkHeadingHierarchy(headings);

		// Count lists, images, and links
		const listCount = (content.match(/<(?:ul|ol)>/gi) || []).length;
		const imageCount = (content.match(/<img[^>]*>/gi) || []).length;
		const imagesWithoutAlt = (content.match(/<img(?![^>]*alt=)[^>]*>/gi) || []).length;

		const internalLinks = (content.match(/<a[^>]*href=["'][^"']*(?:localhost|your-domain)[^"']*["'][^>]*>/gi) || []).length;
		const externalLinks = (content.match(/<a[^>]*href=["'](?:https?:\/\/)[^"']*["'][^>]*>/gi) || []).length - internalLinks;
		const nofollowLinks = (content.match(/<a[^>]*rel=["'][^"']*nofollow[^"']*["'][^>]*>/gi) || []).length;

		return {
			headings,
			hasH1,
			multipleH1,
			headingHierarchy,
			listCount,
			imageCount,
			imagesWithoutAlt,
			linkCount: {
				internal: internalLinks,
				external: externalLinks,
				nofollow: nofollowLinks
			}
		};
	}

	private analyzeTechnical(title: string, description: string, url?: string): TechnicalSeo {
		return {
			titleLength: title.length,
			descriptionLength: description.length,
			urlStructure: url
				? {
						length: url.length,
						hasKeyword: this.config.focusKeyword ? url.toLowerCase().includes(this.config.focusKeyword.toLowerCase()) : false,
						isReadable: this.isUrlReadable(url),
						hasStopWords: this.urlHasStopWords(url)
					}
				: {
						length: 0,
						hasKeyword: false,
						isReadable: true,
						hasStopWords: false
					},
			metaRobots: 'index, follow',
			schemaMarkup: [],
			sitemap: false,
			robotsTxt: false
		};
	}

	private calculateOverallScore(
		keywords: KeywordAnalysis[],
		readability: ReadabilityAnalysis,
		contentStructure: ContentStructure,
		technical: TechnicalSeo
	): SeoScore {
		// Content score (0-100)
		let contentScore = 50;
		if (contentStructure.hasH1) contentScore += 10;
		if (!contentStructure.multipleH1) contentScore += 5;
		if (contentStructure.headingHierarchy) contentScore += 10;
		if (readability.wordCount >= 300) contentScore += 15;
		if (readability.wordCount >= 1000) contentScore += 10;

		// Technical score (0-100)
		let technicalScore = 50;
		if (technical.titleLength >= 30 && technical.titleLength <= 60) technicalScore += 20;
		if (technical.descriptionLength >= 120 && technical.descriptionLength <= 160) technicalScore += 20;
		if (technical.urlStructure.isReadable) technicalScore += 10;

		// Readability score (0-100)
		const readabilityScore = Math.max(0, Math.min(100, (readability.fleschKincaidScore / 100) * 100));

		// Keywords score (0-100)
		let keywordsScore = 50;
		if (keywords.length > 0) {
			const keyword = keywords[0];
			if (keyword.inTitle) keywordsScore += 15;
			if (keyword.inDescription) keywordsScore += 15;
			if (keyword.density >= 0.5 && keyword.density <= 2.5) keywordsScore += 20;
		}

		// Social score (basic implementation)
		const socialScore = 75; // Would be calculated based on social meta tags

		const overall = Math.round((contentScore + technicalScore + readabilityScore + keywordsScore + socialScore) / 5);

		return {
			overall,
			content: contentScore,
			technical: technicalScore,
			readability: readabilityScore,
			keywords: keywordsScore,
			social: socialScore
		};
	}

	private generateSuggestions(
		keywords: KeywordAnalysis[],
		readability: ReadabilityAnalysis,
		contentStructure: ContentStructure,
		technical: TechnicalSeo
	): SeoSuggestion[] {
		const suggestions: SeoSuggestion[] = [];

		// Title suggestions
		if (technical.titleLength < 30) {
			suggestions.push({
				id: 'title-too-short',
				type: 'warning',
				category: 'technical',
				title: 'Title is too short',
				description: 'Your title is shorter than 30 characters. Consider adding more descriptive text.',
				impact: 'high',
				effort: 'easy',
				priority: 90,
				actionable: true,
				fix: 'Add more descriptive keywords to your title to reach 30-60 characters.'
			});
		}

		if (technical.titleLength > 60) {
			suggestions.push({
				id: 'title-too-long',
				type: 'error',
				category: 'technical',
				title: 'Title is too long',
				description: 'Your title exceeds 60 characters and may be truncated in search results.',
				impact: 'high',
				effort: 'easy',
				priority: 95,
				actionable: true,
				fix: 'Shorten your title to 30-60 characters for optimal display.'
			});
		}

		// Description suggestions
		if (technical.descriptionLength < 120) {
			suggestions.push({
				id: 'description-too-short',
				type: 'warning',
				category: 'technical',
				title: 'Meta description is too short',
				description: 'Your meta description is shorter than 120 characters.',
				impact: 'medium',
				effort: 'easy',
				priority: 70,
				actionable: true,
				fix: 'Expand your meta description to 120-160 characters.'
			});
		}

		// Content structure suggestions
		if (!contentStructure.hasH1) {
			suggestions.push({
				id: 'missing-h1',
				type: 'error',
				category: 'content',
				title: 'Missing H1 heading',
				description: 'Your content is missing an H1 heading, which is important for SEO.',
				impact: 'high',
				effort: 'easy',
				priority: 85,
				actionable: true,
				fix: 'Add an H1 heading that includes your focus keyword.'
			});
		}

		if (contentStructure.multipleH1) {
			suggestions.push({
				id: 'multiple-h1',
				type: 'warning',
				category: 'content',
				title: 'Multiple H1 headings',
				description: 'Your content has multiple H1 headings. Use only one H1 per page.',
				impact: 'medium',
				effort: 'easy',
				priority: 60,
				actionable: true,
				fix: 'Use only one H1 heading and convert others to H2 or H3.'
			});
		}

		// Readability suggestions
		if (readability.passiveVoicePercentage > 10) {
			suggestions.push({
				id: 'passive-voice',
				type: 'warning',
				category: 'readability',
				title: 'Too much passive voice',
				description: `${readability.passiveVoicePercentage.toFixed(1)}% of your sentences use passive voice.`,
				impact: 'medium',
				effort: 'medium',
				priority: 50,
				actionable: true,
				fix: 'Convert passive voice sentences to active voice for better readability.'
			});
		}

		if (readability.averageWordsPerSentence > 20) {
			suggestions.push({
				id: 'long-sentences',
				type: 'warning',
				category: 'readability',
				title: 'Sentences are too long',
				description: 'Your average sentence length is high, which may affect readability.',
				impact: 'medium',
				effort: 'medium',
				priority: 45,
				actionable: true,
				fix: 'Break long sentences into shorter ones for better readability.'
			});
		}

		// Keyword suggestions
		if (keywords.length > 0) {
			const keyword = keywords[0];
			if (!keyword.inTitle) {
				suggestions.push({
					id: 'keyword-not-in-title',
					type: 'warning',
					category: 'keywords',
					title: 'Focus keyword not in title',
					description: 'Your focus keyword does not appear in the title.',
					impact: 'high',
					effort: 'easy',
					priority: 80,
					actionable: true,
					fix: `Include "${keyword.focusKeyword}" in your title.`
				});
			}

			if (keyword.density < 0.5) {
				suggestions.push({
					id: 'keyword-density-low',
					type: 'info',
					category: 'keywords',
					title: 'Low keyword density',
					description: 'Your keyword density is quite low.',
					impact: 'low',
					effort: 'easy',
					priority: 30,
					actionable: true,
					fix: `Use "${keyword.focusKeyword}" more frequently in your content.`
				});
			}

			if (keyword.density > 2.5) {
				suggestions.push({
					id: 'keyword-density-high',
					type: 'warning',
					category: 'keywords',
					title: 'High keyword density',
					description: 'Your keyword density might be too high and could be seen as keyword stuffing.',
					impact: 'medium',
					effort: 'easy',
					priority: 65,
					actionable: true,
					fix: `Reduce the frequency of "${keyword.focusKeyword}" in your content.`
				});
			}
		}

		return suggestions.sort((a, b) => b.priority - a.priority);
	}

	// Helper methods
	private tokenize(text: string): string[] {
		return text.toLowerCase().match(/\b\w+\b/g) || [];
	}

	private splitIntoSentences(text: string): string[] {
		return text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
	}

	private countSyllables(text: string): number {
		const words = this.tokenize(text);
		return words.reduce((total, word) => {
			return total + this.countSyllablesInWord(word);
		}, 0);
	}

	private countSyllablesInWord(word: string): number {
		word = word.toLowerCase();
		if (word.length <= 3) return 1;

		const vowels = 'aeiouy';
		let syllableCount = 0;
		let previousWasVowel = false;

		for (let i = 0; i < word.length; i++) {
			const isVowel = vowels.includes(word[i]);
			if (isVowel && !previousWasVowel) {
				syllableCount++;
			}
			previousWasVowel = isVowel;
		}

		// Handle silent 'e'
		if (word.endsWith('e')) {
			syllableCount--;
		}

		return Math.max(1, syllableCount);
	}

	private detectPassiveVoice(sentences: string[]): string[] {
		const passiveIndicators = [
			'was',
			'were',
			'been',
			'being',
			'is',
			'are',
			'am',
			'was being',
			'were being',
			'has been',
			'have been',
			'had been',
			'will be',
			'will have been'
		];

		return sentences.filter((sentence) => {
			const words = this.tokenize(sentence);
			return (
				passiveIndicators.some((indicator) => sentence.toLowerCase().includes(indicator)) &&
				words.some((word) => word.endsWith('ed') || word.endsWith('en'))
			);
		});
	}

	private countTransitionWords(text: string): number {
		const words = this.tokenize(text);
		return words.filter((word) => this.transitionWords.has(word)).length;
	}

	private getReadingLevel(score: number): ReadabilityAnalysis['readingLevel'] {
		if (score >= 90) return 'elementary';
		if (score >= 80) return 'middle-school';
		if (score >= 70) return 'high-school';
		if (score >= 60) return 'college';
		return 'graduate';
	}

	private calculateKeywordProminence(inTitle: boolean, inDescription: boolean, firstOccurrence: number): number {
		let prominence = 0;
		if (inTitle) prominence += 40;
		if (inDescription) prominence += 30;
		if (firstOccurrence >= 0 && firstOccurrence < 10) prominence += 30;
		return prominence;
	}

	private findKeywordInHeadings(content: string, keyword: string): string[] {
		const headingRegex = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi;
		const headingsWithKeyword: string[] = [];

		let match;
		while ((match = headingRegex.exec(content)) !== null) {
			const headingText = match[1].replace(/<[^>]*>/g, '').toLowerCase();
			if (headingText.includes(keyword)) {
				headingsWithKeyword.push(match[0]);
			}
		}

		return headingsWithKeyword;
	}

	private findKeywordVariations(content: string, keyword: string): string[] {
		// Simple implementation - would be more sophisticated in production
		const words = this.tokenize(content);
		const variations = new Set<string>();

		words.forEach((word) => {
			if (word.includes(keyword) || keyword.includes(word)) {
				if (word !== keyword && word.length > 3) {
					variations.add(word);
				}
			}
		});

		return Array.from(variations).slice(0, 5);
	}

	private checkHeadingHierarchy(headings: ContentStructure['headings']): boolean {
		// Simple check: ensure H1 comes before H2, H2 before H3, etc.
		let currentLevel = 0;
		const levels = Object.keys(headings) as Array<keyof typeof headings>;

		for (const level of levels) {
			const levelNumber = parseInt(level.charAt(1));
			if (headings[level].length > 0) {
				if (levelNumber > currentLevel + 1) {
					return false; // Skipped a level
				}
				currentLevel = levelNumber;
			}
		}

		return true;
	}

	private isUrlReadable(url: string): boolean {
		// Check if URL contains readable words vs random characters
		const path = url.split('/').pop() || '';
		const wordCount = (path.match(/[a-zA-Z]+/g) || []).length;
		const totalLength = path.length;

		return wordCount > 0 && (wordCount * 4) / totalLength > 0.5;
	}

	private urlHasStopWords(url: string): boolean {
		const path = url.toLowerCase();
		return Array.from(this.stopWords).some((stopWord) => path.includes(stopWord));
	}

	private extractBreadcrumbs(url?: string): string[] | undefined {
		if (!url) return undefined;

		const path = url.replace(/^https?:\/\/[^/]+/, '');
		const segments = path.split('/').filter((segment) => segment.length > 0);

		return segments.map((segment) => segment.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()));
	}
}
