<!--
@file src/components/site/svedit/svedit-page-renderer.svelte
@component Renders a pages `content` Svedit document with optional inline editing.

### Props
- `document` (Document): Svedit page document.
- `editable` (boolean): Enable inline Svedit editing (live preview / edit mode).
- `onDocumentChange` (function): Called when the document changes during editing.
-->

<script lang="ts">
	import { createSiteSveditSession } from '@components/site/svedit/create-site-session';
	import type { SveditDocument } from '@src/services/site/svedit/types';
	import type { DocumentNode } from 'svedit';
	import { setContext } from 'svelte';
	import { KeyMapper, Svedit } from 'svedit';

	interface Props {
		document: SveditDocument;
		editable?: boolean;
		onDocumentChange?: (document: SveditDocument) => void;
	}

	let { document, editable = false, onDocumentChange }: Props = $props();

	// The $state initializer below intentionally captures the prop's INITIAL
	// value once — later prop updates are reconciled by the $effect that rebuilds
	// the session. Reading the prop inside a closure silences the
	// state_referenced_locally warning while keeping that one-shot intent.
	// The fallback is only reachable when a caller passes a malformed document
	// (fill_document_defaults iterates `doc.nodes` — `{}.nodes` is undefined →
	// Object.entries(undefined) threw on EVERY mount, crashing the public site render).
	const initialDocument = ((): SveditDocument => {
		const doc = document;
		return doc && typeof doc === 'object' && 'nodes' in doc
			? doc
			: ({ nodes: {}, document_id: 'page' } as unknown as SveditDocument);
	})();

	let session = $state(createSiteSveditSession(initialDocument));
	let lastExternalDoc = $state('');
	let lastEmittedDoc = $state('');
	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	// Mobile-friendly edit mode: preview can switch to a read-only view. The
	// server still decides whether editing is allowed at all (`editable`).
	let editMode = $state(true);
	let holdTimer: ReturnType<typeof setTimeout> | null = null;
	let holdFired = false;

	const effectiveEditable = $derived(editable && editMode);

	const keyMapper = new KeyMapper();
	try {
		setContext('key_mapper', keyMapper);
	} catch {
		// Fails soft if called outside component initialization
	}

	$effect(() => {
		const external = JSON.stringify(document);
		if (external !== lastExternalDoc && external !== lastEmittedDoc) {
			lastExternalDoc = external;
			session = createSiteSveditSession(document);
		}
	});

	$effect(() => {
		if (!editable || !onDocumentChange) return;

		const snapshot = JSON.stringify($state.snapshot(session.doc));
		if (snapshot === lastEmittedDoc || snapshot === lastExternalDoc) return;

		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			lastEmittedDoc = snapshot;
			lastExternalDoc = snapshot;
			onDocumentChange($state.snapshot(session.doc) as SveditDocument);
			saveTimer = null;
		}, 300);
	});

	type BlockType = 'hero' | 'paragraph' | 'image' | 'cta';

	const pageId = $derived(session.doc.document_id);

	const blocks = $derived.by(() => {
		const ids = (session.get([pageId, 'body']) ?? []) as string[];
		return ids.map((id, index) => ({
			id,
			index,
			type: String((session.get(id) as { type?: string } | undefined)?.type ?? 'block')
		}));
	});

	function textProperty(content: string) {
		return { content, marks: [], annotations: [] };
	}

	/** Append a block to the page body (Editable-style block palette). */
	function addBlock(type: BlockType) {
		const id = session.generate_id();
		const node =
			type === 'hero'
				? {
						id,
						type,
						heading: textProperty('New hero heading'),
						subheading: textProperty('')
					}
				: type === 'cta'
					? { id, type, label: textProperty('Call to action'), href: '#' }
					: type === 'image'
						? { id, type, src: '', alt: textProperty(''), focalX: 50, focalY: 50 }
						: { id, type, content: textProperty('New paragraph') };

		const tr = session.tr;
		tr.create(node as DocumentNode);
		const body = (session.get([pageId, 'body']) ?? []) as string[];
		tr.set([pageId, 'body'], [...body, id]);
		session.apply(tr);
	}

	/** Reorder a block within the body (up = -1, down = +1). */
	function moveBlock(index: number, delta: number) {
		const body = [...((session.get([pageId, 'body']) ?? []) as string[])];
		const target = index + delta;
		if (target < 0 || target >= body.length) return;
		[body[index], body[target]] = [body[target], body[index]];
		const tr = session.tr;
		tr.set([pageId, 'body'], body);
		session.apply(tr);
	}

	function removeBlock(index: number) {
		const body = [...((session.get([pageId, 'body']) ?? []) as string[])];
		const [removed] = body.splice(index, 1);
		const tr = session.tr;
		tr.set([pageId, 'body'], body);
		if (removed) tr.delete(removed);
		session.apply(tr);
	}

	const FLIP_CYCLE: Record<string, BlockType | undefined> = {
		paragraph: 'hero',
		hero: 'cta',
		cta: 'paragraph'
	};

	/** Convert a text block between paragraph ↔ hero ↔ CTA, keeping its copy. */
	function flipBlock(index: number) {
		const body = [...((session.get([pageId, 'body']) ?? []) as string[])];
		const oldId = body[index];
		if (!oldId) return;
		const oldNode = session.get(oldId) as Record<string, unknown> | undefined;
		const oldType = String(oldNode?.type ?? '');
		const nextType = FLIP_CYCLE[oldType];
		if (!nextType) return; // images keep their type

		const source =
			oldType === 'paragraph'
				? oldNode?.content
				: oldType === 'hero'
					? oldNode?.heading
					: oldNode?.label;
		const content =
			source && typeof source === 'object' && 'content' in source
				? (source as { content: string; marks: unknown[]; annotations: unknown[] })
				: textProperty('');

		const newId = session.generate_id();
		const node =
			nextType === 'hero'
				? { id: newId, type: nextType, heading: content, subheading: textProperty('') }
				: nextType === 'cta'
					? { id: newId, type: nextType, label: content, href: '#' }
					: { id: newId, type: nextType, content };

		const tr = session.tr;
		tr.create(node as DocumentNode);
		body[index] = newId;
		tr.set([pageId, 'body'], body);
		tr.delete(oldId);
		session.apply(tr);
	}

	function startHold() {
		if (!editable) return;
		cancelHold();
		holdFired = false;
		holdTimer = setTimeout(() => {
			holdTimer = null;
			holdFired = true;
			editMode = !editMode;
		}, 600);
	}

	function cancelHold() {
		if (holdTimer) {
			clearTimeout(holdTimer);
			holdTimer = null;
		}
	}

	function toggleEditMode() {
		// A completed hold already toggled; swallow the synthetic click.
		if (holdFired) {
			holdFired = false;
			return;
		}
		editMode = !editMode;
	}
</script>

<svelte:window onkeydown={keyMapper.handle_keydown.bind(keyMapper)} />

{#if effectiveEditable}
	<div
		class="mx-auto mb-4 flex w-full max-w-5xl flex-wrap items-center gap-2 rounded-lg border border-surface-500/30 bg-surface-500/10 p-2 text-surface-600 dark:text-surface-400"
		role="toolbar"
		aria-label="Page blocks"
	>
		<span class="text-xs font-semibold tracking-wider uppercase text-surface-500">Blocks</span>
		<div class="flex flex-wrap items-center gap-1">
			<button
				type="button"
				class="h-10 rounded-md border border-surface-500/30 bg-surface-500/10 px-3 text-sm font-medium hover:bg-surface-500/10 dark:bg-surface-800"
				onclick={() => addBlock('hero')}
				aria-label="Add hero block"
			>
				+ Hero
			</button>
			<button
				type="button"
				class="h-10 rounded-md border border-surface-500/30 bg-surface-500/10 px-3 text-sm font-medium hover:bg-surface-500/10 dark:bg-surface-800"
				onclick={() => addBlock('paragraph')}
				aria-label="Add paragraph block"
			>
				+ Paragraph
			</button>
			<button
				type="button"
				class="h-10 rounded-md border border-surface-500/30 bg-surface-500/10 px-3 text-sm font-medium hover:bg-surface-500/10 dark:bg-surface-800"
				onclick={() => addBlock('cta')}
				aria-label="Add call-to-action block"
			>
				+ CTA
			</button>
			<button
				type="button"
				class="h-10 rounded-md border border-surface-500/30 bg-surface-500/10 px-3 text-sm font-medium hover:bg-surface-500/10 dark:bg-surface-800"
				onclick={() => addBlock('image')}
				aria-label="Add image block"
			>
				+ Image
			</button>
		</div>

		{#if blocks.length > 0}
			<ul class="flex flex-wrap items-center gap-1" aria-label="Block order">
				{#each blocks as block (block.id)}
					<li
						class="flex items-center gap-1 rounded-md border border-surface-500/20 bg-surface-500/80 px-1 dark:bg-surface-800/80"
					>
						<span class="px-1 text-xs">{block.type} {block.index + 1}</span>
						{#if block.type !== 'image'}
							<button
								type="button"
								class="flex h-10 w-10 items-center justify-center rounded-md hover:bg-surface-500/10"
								onclick={() => flipBlock(block.index)}
								aria-label={`Change ${block.type} block type`}
								title="Paragraph → Hero → CTA"
							>
								⇄
							</button>
						{/if}
						<button
							type="button"
							class="flex h-10 w-10 items-center justify-center rounded-md hover:bg-surface-500/10 disabled:opacity-40"
							onclick={() => moveBlock(block.index, -1)}
							disabled={block.index === 0}
							aria-label={`Move ${block.type} block up`}
						>
							↑
						</button>
						<button
							type="button"
							class="flex h-10 w-10 items-center justify-center rounded-md hover:bg-surface-500/10 disabled:opacity-40"
							onclick={() => moveBlock(block.index, 1)}
							disabled={block.index === blocks.length - 1}
							aria-label={`Move ${block.type} block down`}
						>
							↓
						</button>
						<button
							type="button"
							class="flex h-10 w-10 items-center justify-center rounded-md text-error-500 hover:bg-error-500/10"
							onclick={() => removeBlock(block.index)}
							aria-label={`Delete ${block.type} block`}
						>
							✕
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}

<article class="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6" data-svelty-field="content">
	<Svedit {session} editable={effectiveEditable} path={[session.doc.document_id]} />
</article>

{#if editable}
	<div class="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-2">
		<button
			type="button"
			class="pointer-events-auto inline-flex h-10 items-center rounded-full border border-surface-500/40 bg-surface-900/85 px-3 text-xs font-medium text-white shadow-lg"
			onpointerdown={startHold}
			onpointerup={cancelHold}
			onpointerleave={cancelHold}
			onpointercancel={cancelHold}
			onclick={toggleEditMode}
			aria-pressed={editMode}
		>
			{editMode ? 'Editing — tap to preview' : 'Preview — hold to edit'}
		</button>
	</div>
{/if}
