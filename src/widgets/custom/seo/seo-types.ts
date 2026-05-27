/**
 * @file src/widgets/custom/Seo/seoTypes.ts
 * @description Comprehensive TypeScript types for SEO analysis
 */ export interface SeoAnalysisConfig {
	analysisDepth: 'basic' | 'standard' | 'comprehensive';
	contentLanguage: string;
	contentType: 'article' | 'product' | 'service' | 'landing' | 'blog';
	enabledFeatures: SeoFeatureConfig;
	enableRealTimeAnalysis: boolean;
	focusKeyword?: string;
	locale: string;
	targetAudience: 'general' | 'technical' | 'academic' | 'commercial';
}

export interface SeoFeatureConfig {
	advanced: boolean; // Canonical URLs, robots meta, custom meta tags
	ai: boolean; // AI-powered suggestions and optimization
	basic: boolean; // Always enabled - title, description, keywords
	keywords: boolean; // Keyword density, prominence analysis
	preview: boolean; // SERP and social media previews
	readability: boolean; // Flesch-Kincaid, content analysis
	schema: boolean; // JSON-LD structured data
	social: boolean; // Open Graph, Twitter Cards
}

export interface SeoScore {
	content: number;
	keywords: number;
	overall: number;
	readability: number;
	social: number;
	technical: number;
}

export interface KeywordAnalysis {
	density: number;
	distribution: {
		beginning: number;
		middle: number;
		end: number;
	};
	firstOccurrence: number;
	focusKeyword: string;
	inDescription: boolean;
	inHeadings: string[];
	inTitle: boolean;
	inUrl: boolean;
	prominence: number;
	variations: string[];
}

export interface ReadabilityAnalysis {
	averageSentenceLength: number;
	averageWordsPerSentence: number;
	complexSentences: number;
	fleschKincaidScore: number;
	paragraphCount: number;
	passiveVoicePercentage: number;
	readingLevel: 'elementary' | 'middle-school' | 'high-school' | 'college' | 'graduate';
	readingTime: number;
	sentenceCount: number;
	sentencesWithPassiveVoice: number;
	transitionWords: number;
	wordCount: number;
}

export interface ContentStructure {
	hasH1: boolean;
	headingHierarchy: boolean;
	headings: {
		h1: string[];
		h2: string[];
		h3: string[];
		h4: string[];
		h5: string[];
		h6: string[];
	};
	imageCount: number;
	imagesWithoutAlt: number;
	linkCount: {
		internal: number;
		external: number;
		nofollow: number;
	};
	listCount: number;
	multipleH1: boolean;
}

export interface TechnicalSeo {
	canonicalUrl?: string;
	descriptionLength: number;
	metaRobots: string;
	robotsTxt: boolean;
	schemaMarkup: string[];
	sitemap: boolean;
	titleLength: number;
	urlStructure: {
		length: number;
		hasKeyword: boolean;
		isReadable: boolean;
		hasStopWords: boolean;
	};
}

export interface SocialMediaPreviews {
	facebook: {
		title: string;
		description: string;
		image: string;
		type: string;
	};
	linkedin: {
		title: string;
		description: string;
		image: string;
	};
	twitter: {
		title: string;
		description: string;
		image: string;
		card: 'summary' | 'summary_large_image' | 'app' | 'player';
	};
}

export interface SeoSuggestion {
	actionable: boolean;
	category: 'content' | 'technical' | 'readability' | 'keywords' | 'social';
	description: string;
	effort: 'easy' | 'medium' | 'hard';
	fix?: string;
	id: string;
	impact: 'high' | 'medium' | 'low';
	priority: number;
	title: string;
	type: 'error' | 'warning' | 'success' | 'info';
}

export interface SerpPreview {
	breadcrumbs?: string[];
	description: string;
	richSnippets?: {
		type: 'article' | 'product' | 'review' | 'faq' | 'recipe' | 'event';
		data: Record<string, unknown>;
	};
	siteLinks?: Array<{
		title: string;
		url: string;
	}>;
	title: string;
	url: string;
}

export interface AiSeoConfig {
	competitorUrls?: string[];
	enableAutoSuggestions: boolean;
	enableContentOptimization: boolean;
	industryContext?: string;
	maxTokens: number;
	model: string;
	provider: 'openai' | 'claude' | 'gemini' | 'local';
	targetAudience: 'general' | 'technical' | 'academic' | 'commercial';
	temperature: number;
}

export interface SeoAnalysisResult {
	analysisTime: number;
	contentStructure: ContentStructure;
	keywords: KeywordAnalysis[];
	lastAnalyzed: Date;
	readability: ReadabilityAnalysis;
	score: SeoScore;
	serpPreview: SerpPreview;
	social: SocialMediaPreviews;
	suggestions: SeoSuggestion[];
	technical: TechnicalSeo;
}

// Svelte 5 specific types
export interface SeoState {
	canonicalUrl: string;
	customMeta: Array<{ name: string; content: string; property?: string }>;
	description: string;
	focusKeyword: string;
	keywords: string[];
	ogDescription: string;
	ogImage: string;
	ogTitle: string;
	robotsMeta: string;
	schemaMarkup: string;
	title: string;
	twitterCard: string;
	twitterDescription: string;
	twitterImage: string;
	twitterTitle: string;
}

export interface SeoActions {
	analyzeContent: () => Promise<SeoAnalysisResult>;
	exportData: () => string;
	generateSuggestions: () => SeoSuggestion[];
	importData: (data: string) => void;
	reset: () => void;
	updateDescription: (description: string) => void;
	updateFocusKeyword: (keyword: string) => void;
	updateKeywords: (keywords: string[]) => void;
	updateRobotsMeta: (robots: string) => void;
	updateSocialMeta: (platform: 'og' | 'twitter', field: string, value: string) => void;
	updateTitle: (title: string) => void;
}

export type SeoStore = SeoState & SeoActions;

// Enhanced Schema Markup Types for AI SEO
export interface SchemaMarkupObject {
	'@context': string;
	'@type': SchemaType;
	address?: SchemaAddress;
	aggregateRating?: SchemaAggregateRating;
	articleSection?: string;
	author?: SchemaAuthor | SchemaAuthor[];
	brand?: SchemaBrand;
	contactPoint?: SchemaContactPoint[];
	dateModified?: string;
	datePublished?: string;
	description?: string;
	endDate?: string;
	gtin?: string;
	headline?: string;
	image?: string | SchemaImage | SchemaImage[];
	keywords?: string[];
	location?: SchemaPlace;
	// Organization-specific
	logo?: string | SchemaImage;
	// FAQ-specific
	mainEntity?: SchemaQuestion[];
	mainEntityOfPage?: string;
	model?: string;
	name?: string;
	// Product-specific
	offers?: SchemaOffer | SchemaOffer[];
	publisher?: SchemaOrganization;
	// Review-specific
	review?: SchemaReview[];
	sku?: string;
	// Event-specific
	startDate?: string;
	url?: string;
	wordCount?: number;
}

export type SchemaType =
	| 'Article'
	| 'BlogPosting'
	| 'NewsArticle'
	| 'Product'
	| 'Service'
	| 'Organization'
	| 'Person'
	| 'Event'
	| 'Recipe'
	| 'FAQ'
	| 'HowTo'
	| 'LocalBusiness'
	| 'WebPage'
	| 'WebSite'
	| 'BreadcrumbList';

export interface SchemaAuthor {
	'@type': 'Person' | 'Organization';
	image?: string;
	name: string;
	url?: string;
}

export interface SchemaOrganization {
	'@type': 'Organization';
	logo?: SchemaImage;
	name: string;
	url?: string;
}

export interface SchemaImage {
	'@type': 'ImageObject';
	caption?: string;
	height?: number;
	url: string;
	width?: number;
}

export interface SchemaOffer {
	'@type': 'Offer';
	availability: string;
	price: string;
	priceCurrency: string;
	seller?: SchemaOrganization;
	url?: string;
}

export interface SchemaBrand {
	'@type': 'Brand';
	logo?: string;
	name: string;
}

export interface SchemaContactPoint {
	'@type': 'ContactPoint';
	availableLanguage?: string[];
	contactType: string;
	telephone: string;
}

export interface SchemaAddress {
	'@type': 'PostalAddress';
	addressCountry: string;
	addressLocality: string;
	addressRegion?: string;
	postalCode: string;
	streetAddress: string;
}

export interface SchemaPlace {
	'@type': 'Place';
	address: SchemaAddress;
	name: string;
}

export interface SchemaQuestion {
	'@type': 'Question';
	acceptedAnswer: {
		'@type': 'Answer';
		text: string;
	};
	name: string;
}

export interface SchemaReview {
	'@type': 'Review';
	author: SchemaAuthor;
	reviewBody: string;
	reviewRating: {
		'@type': 'Rating';
		ratingValue: number;
		bestRating?: number;
	};
}

export interface SchemaAggregateRating {
	'@type': 'AggregateRating';
	bestRating?: number;
	ratingValue: number;
	reviewCount: number;
	worstRating?: number;
}

// AI-Enhanced SEO Types
export interface AiSeoSuggestion extends SeoSuggestion {
	aiGenerated: true;
	alternativeOptions?: string[];
	confidence: number; // 0-1 score
	contentOptimization?: {
		originalText: string;
		optimizedText: string;
		improvements: string[];
	};
	reasoning: string;
	schemaRecommendation?: SchemaMarkupObject;
}

export interface AiSeoAnalysis {
	competitiveAnalysis?: {
		similarPages: string[];
		gapAnalysis: string[];
		opportunities: string[];
	};
	contentOptimizations: {
		title: string;
		description: string;
		keywords: string[];
		reasoning: string;
	};
	schemaRecommendations: SchemaMarkupObject[];
	suggestions: AiSeoSuggestion[];
}
