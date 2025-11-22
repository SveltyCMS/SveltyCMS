/**
 * @file src/services/tokens/examples.ts
 * @description Usage examples for the SveltyCMS Token System
 * 
 * This file contains practical examples of how to use the token system
 * in various scenarios within SveltyCMS.
 */

import { replaceTokens, getAvailableTokens, getTokensByScope } from './index';
import type { TokenContext, TokenDefinition } from './types';
import type { Schema, CollectionEntry } from '../../content/types';

// =============================================================================
// Example 1: SEO Meta Title Generation
// =============================================================================

export function generateSEOTitle(entry: CollectionEntry, siteName: string): string {
	const context: TokenContext = {
		entry,
		siteConfig: { name: siteName }
	};

	const template = '{{entry.title}} | {{site.name}}';
	const result = replaceTokens(template, context);
	
	return result.result;
}

// Usage:
// const metaTitle = generateSEOTitle(
//   { title: 'My Blog Post' },
//   'My Awesome Blog'
// );
// Output: "My Blog Post | My Awesome Blog"

// =============================================================================
// Example 2: URL Slug Generation from Title
// =============================================================================

export function generateSlug(title: string): string {
	const context: TokenContext = {
		entry: { title }
	};

	const template = '{{entry.title|slug}}';
	const result = replaceTokens(template, context);
	
	return result.result;
}

// Usage:
// const slug = generateSlug('How to Build a CMS in 2024!');
// Output: "how-to-build-a-cms-in-2024"

// =============================================================================
// Example 3: Email Template with User Info
// =============================================================================

export function generateWelcomeEmail(userName: string, siteName: string): string {
	const context: TokenContext = {
		user: { name: userName },
		siteConfig: { name: siteName }
	};

	const template = `
		Hi {{user.name|capitalize}},
		
		Welcome to {{site.name}}! We're excited to have you on board.
		
		Best regards,
		The {{site.name}} Team
	`;

	const result = replaceTokens(template, context);
	return result.result;
}

// =============================================================================
// Example 4: Article Preview with Truncation
// =============================================================================

export function generateArticlePreview(entry: CollectionEntry): {
	title: string;
	preview: string;
	readTime: string;
} {
	const context: TokenContext = { entry };

	const title = replaceTokens('{{entry.title|capitalize}}', context).result;
	const preview = replaceTokens('{{entry.content|strip|truncate:200}}', context).result;
	const readTime = replaceTokens('{{entry.readTime|default:"5"}} min read', context).result;

	return { title, preview, readTime };
}

// =============================================================================
// Example 5: File Naming Convention
// =============================================================================

export function generateFileName(entry: CollectionEntry, extension: string = 'pdf'): string {
	const context: TokenContext = {
		entry,
		system: { year: new Date().getFullYear() }
	};

	const template = `{{system.year}}-{{entry.slug}}.${extension}`;
	const result = replaceTokens(template, context);
	
	return result.result;
}

// Usage:
// const fileName = generateFileName({ slug: 'my-document' }, 'pdf');
// Output: "2024-my-document.pdf"

// =============================================================================
// Example 6: Social Media Share Text
// =============================================================================

export function generateSocialShareText(entry: CollectionEntry, siteUrl: string): {
	twitter: string;
	facebook: string;
	linkedin: string;
} {
	const context: TokenContext = {
		entry,
		siteConfig: { url: siteUrl }
	};

	// Twitter (280 char limit)
	const twitter = replaceTokens(
		'{{entry.title|truncate:200}} {{site.url}}/{{entry.slug}}',
		context
	).result;

	// Facebook (longer allowed)
	const facebook = replaceTokens(
		'{{entry.title}}\n\n{{entry.description|truncate:300}}\n\nRead more: {{site.url}}/{{entry.slug}}',
		context
	).result;

	// LinkedIn
	const linkedin = replaceTokens(
		'{{entry.title}}\n\n{{entry.description|truncate:250}}\n\n{{site.url}}/{{entry.slug}}',
		context
	).result;

	return { twitter, facebook, linkedin };
}

// =============================================================================
// Example 7: Breadcrumb Generation
// =============================================================================

export function generateBreadcrumb(collection: Schema, entry: CollectionEntry): string {
	const context: TokenContext = {
		collection,
		entry
	};

	const template = '{{collection.label}} > {{entry.title|truncate:30}}';
	const result = replaceTokens(template, context);
	
	return result.result;
}

// =============================================================================
// Example 8: Dynamic Form Field Placeholder
// =============================================================================

export function generateFieldPlaceholder(fieldLabel: string, isRequired: boolean): string {
	const context: TokenContext = {
		field: { label: fieldLabel, required: isRequired }
	};

	const template = isRequired
		? 'Enter {{field.label|lowercase}} *'
		: 'Enter {{field.label|lowercase}} (optional)';
	
	const result = replaceTokens(template, context);
	return result.result;
}

// =============================================================================
// Example 9: Author Attribution
// =============================================================================

export function generateAuthorAttribution(entry: CollectionEntry): string {
	const context: TokenContext = { entry };

	const template = `
		By {{entry.author.name}}
		Published {{entry.publishedAt|date:"MM/DD/YYYY"}}
		Last updated {{entry.updatedAt|date:"MM/DD/YYYY"}}
	`.trim();

	const result = replaceTokens(template, context);
	return result.result;
}

// =============================================================================
// Example 10: Token Discovery for UI
// =============================================================================

export function getTokensForCollectionField(schema: Schema, currentUser: any): {
	entry: TokenDefinition[];
	collection: TokenDefinition[];
	user: TokenDefinition[];
	system: TokenDefinition[];
} {
	const context: TokenContext = {
		collection: schema,
		user: currentUser
	};

	// Get tokens grouped by scope for UI display
	const grouped = getTokensByScope(context);
	
	return {
		entry: grouped.entry,
		collection: grouped.collection,
		user: grouped.user,
		system: grouped.system
	};
}

// =============================================================================
// Example 11: Advanced Chaining - Generate API Endpoint
// =============================================================================

export function generateAPIEndpoint(collection: Schema, entry: CollectionEntry): string {
	const context: TokenContext = {
		collection,
		entry
	};

	const template = '/api/{{collection.name|lowercase}}/{{entry.slug|kebabcase}}';
	const result = replaceTokens(template, context);
	
	return result.result;
}

// Usage:
// const endpoint = generateAPIEndpoint(
//   { name: 'BlogPosts' },
//   { slug: 'My First Post' }
// );
// Output: "/api/blogposts/my-first-post"

// =============================================================================
// Example 12: Conditional Content with Default Values
// =============================================================================

export function generatePageDescription(entry: CollectionEntry): string {
	const context: TokenContext = { entry };

	// Use custom description if available, otherwise use excerpt, 
	// otherwise use truncated content
	const template = '{{entry.metaDescription|default:"{{entry.excerpt|default:"{{entry.content|strip|truncate:160}}"}}"}}'
	const result = replaceTokens(template, context);
	
	return result.result;
}

// =============================================================================
// Example 13: Multi-Language Support
// =============================================================================

export function generateLocalizedTitle(
	entry: CollectionEntry,
	language: string,
	siteName: string
): string {
	const context: TokenContext = {
		entry,
		siteConfig: { name: siteName },
		contentLanguage: language
	};

	// Language-aware title generation
	const template = '{{entry.title}} | {{site.name}} - {{system.language|uppercase}}';
	const result = replaceTokens(template, context);
	
	return result.result;
}

// =============================================================================
// Example 14: Error Handling and Validation
// =============================================================================

export function safeReplaceTokens(
	template: string,
	context: TokenContext
): { success: boolean; result: string; errors: string[] } {
	const errorMessages: string[] = [];

	const result = replaceTokens(template, context, {
		onError: (error, token) => {
			errorMessages.push(`Failed to resolve token "${token}": ${error.message}`);
		},
		preserveUnresolved: true // Keep unresolved tokens visible
	});

	return {
		success: result.errors.length === 0,
		result: result.result,
		errors: errorMessages
	};
}

// Usage:
// const { success, result, errors } = safeReplaceTokens(
//   '{{entry.title}} by {{entry.author.name}}',
//   { entry: { title: 'Test' } }
// );
// if (!success) {
//   console.error('Token replacement errors:', errors);
// }

// =============================================================================
// Example 15: Batch Processing Multiple Templates
// =============================================================================

export function batchProcessTemplates(
	templates: Record<string, string>,
	context: TokenContext
): Record<string, string> {
	const results: Record<string, string> = {};

	for (const [key, template] of Object.entries(templates)) {
		const result = replaceTokens(template, context);
		results[key] = result.result;
	}

	return results;
}

// Usage:
// const processed = batchProcessTemplates({
//   metaTitle: '{{entry.title}} | {{site.name}}',
//   metaDescription: '{{entry.description|truncate:160}}',
//   ogTitle: '{{entry.title}}',
//   ogDescription: '{{entry.description|truncate:200}}'
// }, context);

// =============================================================================
// Example 16: Token Preview for UI
// =============================================================================

export function generateTokenPreview(context: TokenContext): Array<{
	key: string;
	label: string;
	preview: string;
	example: string;
}> {
	const tokens = getAvailableTokens(context);

	return tokens
		.filter(token => token.available)
		.slice(0, 10) // Limit for UI display
		.map(token => ({
			key: token.key,
			label: token.label,
			preview: token.previewValue || 'N/A',
			example: `{{${token.key}}}`
		}));
}

// =============================================================================
// Example 17: Template Validation
// =============================================================================

export function validateTemplate(template: string, context: TokenContext): {
	isValid: boolean;
	missingTokens: string[];
	warnings: string[];
} {
	const result = replaceTokens(template, context);

	const warnings: string[] = [];
	
	// Check for potential issues
	if (result.errors.length > 0) {
		warnings.push(...result.errors.map(e => e.message));
	}

	return {
		isValid: result.unresolved.length === 0,
		missingTokens: result.unresolved,
		warnings
	};
}

// =============================================================================
// Example 18: Complex Nested Data Access
// =============================================================================

export function generateAuthorBio(entry: CollectionEntry): string {
	const context: TokenContext = { entry };

	const template = `
		{{entry.author.name|capitalize}}
		{{entry.author.role|uppercase}}
		{{entry.author.bio.text|truncate:100}}
		{{entry.author.social.twitter|prepend:"@"}}
	`.trim();

	const result = replaceTokens(template, context);
	return result.result;
}

// =============================================================================
// Example 19: Dynamic CSS Class Names
// =============================================================================

export function generateCSSClasses(entry: CollectionEntry): string {
	const context: TokenContext = { entry };

	const template = 'entry-{{entry.status|lowercase}} category-{{entry.category|kebabcase}}';
	const result = replaceTokens(template, context);
	
	return result.result;
}

// Usage:
// const classes = generateCSSClasses({
//   status: 'PUBLISHED',
//   category: 'Tech News'
// });
// Output: "entry-published category-tech-news"

// =============================================================================
// Example 20: RSS Feed Item Generation
// =============================================================================

export function generateRSSItem(entry: CollectionEntry, siteUrl: string): {
	title: string;
	description: string;
	link: string;
	pubDate: string;
} {
	const context: TokenContext = {
		entry,
		siteConfig: { url: siteUrl }
	};

	return {
		title: replaceTokens('{{entry.title}}', context).result,
		description: replaceTokens('{{entry.content|strip|truncate:500}}', context).result,
		link: replaceTokens('{{site.url}}/{{entry.slug}}', context).result,
		pubDate: replaceTokens('{{entry.publishedAt|date:"YYYY-MM-DD"}}', context).result
	};
}

// (No additional imports needed - removed duplicate import)

