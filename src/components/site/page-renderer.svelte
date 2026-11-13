<!--
@file src/components/site/page-renderer.svelte
@component
**Renders a site page entry** with live-preview field markers and native UI components.

### Props
- `page` (SitePage): Localized page data.
- `editable` (boolean): Enable click-to-edit field markers.
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Card from '@components/ui/card.svelte';
	import SveditPageRenderer from '@components/site/svedit/svedit-page-renderer.svelte';
	import { parseSveditContent, type SveditDocument } from '@src/services/site/svedit/types';
	import type { SiteContentBlock, SitePage, SitePageContent } from '@src/services/site/types';
	import { postDocumentUpdate, postFieldClick } from '@utils/site-preview-bridge';
	import { safeHref } from '@utils/sanitize-html';

	/**
	 * Pass-through marker: `page` arrives from the server loader, where
	 * `localizeSitePage()` sanitizes the body and rich-text blocks with the
	 * parser-based allowlist (`sanitize-html.server.ts`). The parser is
	 * server-only, so nothing is imported into the browser bundle here.
	 * Never route raw or unsanitized HTML through this `@html` sink.
	 */
	function serverSanitizedHtml(html: string | undefined): string {
		return html ?? '';
	}

	interface Props {
		page: SitePage;
		editable?: boolean;
	}

	let { page, editable = false }: Props = $props();

	function handleFieldClick(fieldName: string) {
		if (!editable) return;
		postFieldClick(fieldName);
	}

	function parseContent(raw: SitePage['content']): SiteContentBlock[] {
		if (!raw) return [];
		if (typeof raw === 'string') {
			try {
				const parsed = JSON.parse(raw) as SitePageContent;
				return parsed.blocks || [];
			} catch {
				return [];
			}
		}
		return raw.blocks || [];
	}

	const blocks = $derived(parseContent(page.content));
	const sveditDocument = $derived(parseSveditContent(page.content));
	const hasHero = $derived(!!(page.heroHeading || page.heroSubheading || page.ctaText));
	/**
	 * `ctaHref` comes from a free-text collection field, so it is untrusted: an
	 * editor (or a compromised account) could store `javascript:…`. `safeHref`
	 * drops script-capable schemes before the value reaches `<a href>`.
	 */
	const heroCtaHref = $derived(safeHref(page.ctaHref));
	const sanitizedBody = $derived(
		serverSanitizedHtml(typeof page.body === 'string' ? page.body : '')
	);
	const sanitizedBlockHtml = (raw: string | undefined) => serverSanitizedHtml(raw);

	function handleSveditChange(document: SveditDocument) {
		postDocumentUpdate('content', document);
	}
</script>

{#if sveditDocument}
	<SveditPageRenderer
		document={sveditDocument}
		{editable}
		onDocumentChange={editable ? handleSveditChange : undefined}
	/>
{:else}
	<article class="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
		{#if hasHero}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<section
				class="mb-12 rounded-2xl bg-linear-to-br from-primary-500/10 via-surface-50 to-tertiary-500/10 p-8 dark:from-primary-500/20 dark:via-surface-900 dark:to-tertiary-500/10"
				data-svelty-field="heroHeading"
				onclick={() => handleFieldClick('heroHeading')}
				onkeydown={(e) => e.key === 'Enter' && handleFieldClick('heroHeading')}
				role={editable ? 'button' : undefined}
				tabindex={editable ? 0 : undefined}
			>
				{#if page.heroHeading}
					<h1
						class="text-4xl font-bold tracking-tight text-(--admin-text-body)"
						data-svelty-field="heroHeading"
					>
						{page.heroHeading}
					</h1>
				{/if}
				{#if page.heroSubheading}
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<p
						class="mt-4 text-lg text-(--admin-text-muted)"
						data-svelty-field="heroSubheading"
						onclick={(e) => {
							e.stopPropagation();
							handleFieldClick('heroSubheading');
						}}
						onkeydown={(e) => e.key === 'Enter' && handleFieldClick('heroSubheading')}
						role={editable ? 'button' : undefined}
						tabindex={editable ? 0 : undefined}
					>
						{page.heroSubheading}
					</p>
				{/if}
				{#if page.ctaText && heroCtaHref}
					<div class="mt-6">
						<Button
							variant="primary"
							href={heroCtaHref}
							data-svelty-field="ctaText"
							onclick={() => handleFieldClick('ctaText')}
						>
							{page.ctaText}
						</Button>
					</div>
				{/if}
			</section>
		{/if}

		{#if page.title && !page.heroHeading}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<h1
				class="mb-6 text-3xl font-bold text-(--admin-text-body)"
				data-svelty-field="title"
				onclick={() => handleFieldClick('title')}
				onkeydown={(e) => e.key === 'Enter' && handleFieldClick('title')}
				role={editable ? 'button' : undefined}
				tabindex={editable ? 0 : undefined}
			>
				{page.title}
			</h1>
		{/if}

		{#if page.body}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				class="prose prose-surface mb-10 max-w-none dark:prose-invert"
				data-svelty-field="body"
				onclick={() => handleFieldClick('body')}
				onkeydown={(e) => e.key === 'Enter' && handleFieldClick('body')}
				role={editable ? 'button' : undefined}
				tabindex={editable ? 0 : undefined}
			>
				<!-- slop:suppress security — serverSanitizedHtml() sanitizes the stored body server-side; the client only re-renders it -->
				{@html sanitizedBody}
			</div>
		{/if}

		{#each blocks as block, index (index)}
			<Card variant="surface" class="mb-6 p-6">
				{#if block.type === 'hero' || block.type === 'section'}
					{#if block.heading}
						<h2 class="text-2xl font-semibold text-(--admin-text-body)">
							{block.heading}
						</h2>
					{/if}
					{#if block.subheading}
						<p class="mt-2 text-(--admin-text-muted)">{block.subheading}</p>
					{/if}
					{#if block.body}
						<p class="mt-4 text-(--admin-text-muted)">{block.body}</p>
					{/if}
				{:else if block.type === 'richtext'}
					<!-- slop:suppress security — serverSanitizedHtml() sanitizes each stored block server-side -->
					<div class="prose dark:prose-invert">{@html sanitizedBlockHtml(block.body)}</div>
				{:else if block.type === 'cta' && block.ctaText}
					{@const ctaHref = safeHref(block.ctaHref)}
					{#if ctaHref}
						<Button variant="primary" href={ctaHref}>{block.ctaText}</Button>
					{:else}
						<!-- Unguarded or rejected target: keep the copy, drop the dead link. -->
						<p class="text-(--admin-text-muted)">{block.ctaText}</p>
					{/if}
				{/if}
			</Card>
		{/each}
	</article>
{/if}
