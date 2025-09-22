/**
 * @file src/widgets/custom/seo/seoTypes.ts
 * @description Comprehensive TypeScript types for enterprise-level SEO analysis
 */ export interface SeoAnalysisConfig {
	focusKeyword?: string;
	locale: string;
	contentLanguage: string;
	targetAudience: 'general' | 'technical' | 'academic' | 'commercial';
	contentType: 'article' | 'product' | 'service' | 'landing' | 'blog';
	enableRealTimeAnalysis: boolean;
	analysisDepth: 'basic' | 'standard' | 'comprehensive';
	enabledFeatures: SeoFeatureConfig;
}

export interface SeoFeatureConfig {
	basic: boolean; // Always enabled - title, description, keywords
	advanced: boolean; // Canonical URLs, robots meta, custom meta tags
	social: boolean; // Open Graph, Twitter Cards
	schema: boolean; // JSON-LD structured data
	ai: boolean; // AI-powered suggestions and optimization
	readability: boolean; // Flesch-Kincaid, content analysis
	keywords: boolean; // Keyword density, prominence analysis
	preview: boolean; // SERP and social media previews
}

export interface SeoScore {
	overall: number;
	content: number;
	technical: number;
	readability: number;
	keywords: number;
	social: number;
}

export interface KeywordAnalysis {
	focusKeyword: string;
	density: number;
	prominence: number;
	firstOccurrence: number;
	inTitle: boolean;
	inDescription: boolean;
	inUrl: boolean;
	inHeadings: string[];
	variations: string[];
	distribution: {
		beginning: number;
		middle: number;
		end: number;
	};
}

export interface ReadabilityAnalysis {
	fleschKincaidScore: number;
	readingLevel: 'elementary' | 'middle-school' | 'high-school' | 'college' | 'graduate';
	averageSentenceLength: number;
	averageWordsPerSentence: number;
	passiveVoicePercentage: number;
	sentencesWithPassiveVoice: number;
	complexSentences: number;
	transitionWords: number;
	readingTime: number;
	wordCount: number;
	sentenceCount: number;
	paragraphCount: number;
}

export interface ContentStructure {
	headings: {
		h1: string[];
		h2: string[];
		h3: string[];
		h4: string[];
		h5: string[];
		h6: string[];
	};
	hasH1: boolean;
	multipleH1: boolean;
	headingHierarchy: boolean;
	listCount: number;
	imageCount: number;
	imagesWithoutAlt: number;
	linkCount: {
		internal: number;
		external: number;
		nofollow: number;
	};
}

export interface TechnicalSeo {
	titleLength: number;
	descriptionLength: number;
	urlStructure: {
		length: number;
		hasKeyword: boolean;
		isReadable: boolean;
		hasStopWords: boolean;
	};
	metaRobots: string;
	canonicalUrl?: string;
	schemaMarkup: string[];
	sitemap: boolean;
	robotsTxt: boolean;
}

export interface SocialMediaPreviews {
	facebook: {
		title: string;
		description: string;
		image: string;
		type: string;
	};
	twitter: {
		title: string;
		description: string;
		image: string;
		card: 'summary' | 'summary_large_image' | 'app' | 'player';
	};
	linkedin: {
		title: string;
		description: string;
		image: string;
	};
}

export interface SeoSuggestion {
	id: string;
	type: 'error' | 'warning' | 'success' | 'info';
	category: 'content' | 'technical' | 'readability' | 'keywords' | 'social';
	title: string;
	description: string;
	impact: 'high' | 'medium' | 'low';
	effort: 'easy' | 'medium' | 'hard';
	priority: number;
	actionable: boolean;
	fix?: string;
}

export interface SerpPreview {
	title: string;
	description: string;
	url: string;
	breadcrumbs?: string[];
	richSnippets?: {
		type: 'article' | 'product' | 'review' | 'faq' | 'recipe' | 'event';
		data: Record<string, unknown>;
	};
	siteLinks?: Array<{
		title: string;
		url: string;
	}>;
}

export interface AiSeoConfig {
	provider: 'openai' | 'claude' | 'gemini' | 'local';
	model: string;
	temperature: number;
	maxTokens: number;
	enableAutoSuggestions: boolean;
	enableContentOptimization: boolean;
	targetAudience: 'general' | 'technical' | 'academic' | 'commercial';
	industryContext?: string;
	competitorUrls?: string[];
}

export interface SeoAnalysisResult {
	score: SeoScore;
	keywords: KeywordAnalysis[];
	readability: ReadabilityAnalysis;
	contentStructure: ContentStructure;
	technical: TechnicalSeo;
	social: SocialMediaPreviews;
	suggestions: SeoSuggestion[];
	serpPreview: SerpPreview;
	lastAnalyzed: Date;
	analysisTime: number;
}

// Svelte 5 specific types
export type SeoState = {
	title: string;
	description: string;
	keywords: string[];
	focusKeyword: string;
	robotsMeta: string;
	canonicalUrl: string;
	ogTitle: string;
	ogDescription: string;
	ogImage: string;
	twitterTitle: string;
	twitterDescription: string;
	twitterImage: string;
	twitterCard: string;
	schemaMarkup: string;
	customMeta: Array<{ name: string; content: string; property?: string }>;
};

export type SeoActions = {
	updateTitle: (title: string) => void;
	updateDescription: (description: string) => void;
	updateKeywords: (keywords: string[]) => void;
	updateFocusKeyword: (keyword: string) => void;
	updateRobotsMeta: (robots: string) => void;
	updateSocialMeta: (platform: 'og' | 'twitter', field: string, value: string) => void;
	analyzeContent: () => Promise<SeoAnalysisResult>;
	generateSuggestions: () => SeoSuggestion[];
	exportData: () => string;
	importData: (data: string) => void;
	reset: () => void;
};

export type SeoStore = SeoState & SeoActions;

// Enhanced Schema Markup Types for AI SEO
export interface SchemaMarkupObject {
	'@context': string;
	'@type': SchemaType;
	name?: string;
	headline?: string;
	description?: string;
	author?: SchemaAuthor | SchemaAuthor[];
	publisher?: SchemaOrganization;
	datePublished?: string;
	dateModified?: string;
	image?: string | SchemaImage | SchemaImage[];
	url?: string;
	mainEntityOfPage?: string;
	articleSection?: string;
	wordCount?: number;
	keywords?: string[];
	// Product-specific
	offers?: SchemaOffer | SchemaOffer[];
	brand?: SchemaBrand;
	model?: string;
	sku?: string;
	gtin?: string;
	// Organization-specific
	logo?: string | SchemaImage;
	contactPoint?: SchemaContactPoint[];
	address?: SchemaAddress;
	// Event-specific
	startDate?: string;
	endDate?: string;
	location?: SchemaPlace;
	// FAQ-specific
	mainEntity?: SchemaQuestion[];
	// Review-specific
	review?: SchemaReview[];
	aggregateRating?: SchemaAggregateRating;
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
	name: string;
	url?: string;
	image?: string;
}

export interface SchemaOrganization {
	'@type': 'Organization';
	name: string;
	logo?: SchemaImage;
	url?: string;
}

export interface SchemaImage {
	'@type': 'ImageObject';
	url: string;
	width?: number;
	height?: number;
	caption?: string;
}

export interface SchemaOffer {
	'@type': 'Offer';
	price: string;
	priceCurrency: string;
	availability: string;
	url?: string;
	seller?: SchemaOrganization;
}

export interface SchemaBrand {
	'@type': 'Brand';
	name: string;
	logo?: string;
}

export interface SchemaContactPoint {
	'@type': 'ContactPoint';
	telephone: string;
	contactType: string;
	availableLanguage?: string[];
}

export interface SchemaAddress {
	'@type': 'PostalAddress';
	streetAddress: string;
	addressLocality: string;
	addressRegion?: string;
	postalCode: string;
	addressCountry: string;
}

export interface SchemaPlace {
	'@type': 'Place';
	name: string;
	address: SchemaAddress;
}

export interface SchemaQuestion {
	'@type': 'Question';
	name: string;
	acceptedAnswer: {
		'@type': 'Answer';
		text: string;
	};
}

export interface SchemaReview {
	'@type': 'Review';
	reviewRating: {
		'@type': 'Rating';
		ratingValue: number;
		bestRating?: number;
	};
	author: SchemaAuthor;
	reviewBody: string;
}

export interface SchemaAggregateRating {
	'@type': 'AggregateRating';
	ratingValue: number;
	reviewCount: number;
	bestRating?: number;
	worstRating?: number;
}

// AI-Enhanced SEO Types
export interface AiSeoSuggestion extends SeoSuggestion {
	aiGenerated: true;
	confidence: number; // 0-1 score
	reasoning: string;
	alternativeOptions?: string[];
	schemaRecommendation?: SchemaMarkupObject;
	contentOptimization?: {
		originalText: string;
		optimizedText: string;
		improvements: string[];
	};
}

export interface AiSeoAnalysis {
	suggestions: AiSeoSuggestion[];
	schemaRecommendations: SchemaMarkupObject[];
	contentOptimizations: {
		title: string;
		description: string;
		keywords: string[];
		reasoning: string;
	};
	competitiveAnalysis?: {
		similarPages: string[];
		gapAnalysis: string[];
		opportunities: string[];
	};
}
