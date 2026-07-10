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
	import { setContext } from 'svelte';
	import { KeyMapper, Svedit } from 'svedit';

	interface Props {
		document: SveditDocument;
		editable?: boolean;
		onDocumentChange?: (document: SveditDocument) => void;
	}

	let { document, editable = false, onDocumentChange }: Props = $props();

	let session = $state(createSiteSveditSession(document));
	let lastExternalDoc = $state(JSON.stringify(document));
	let lastEmittedDoc = $state("");
	let saveTimer: ReturnType<typeof setTimeout> | null = null;

	const keyMapper = new KeyMapper();
	setContext('key_mapper', keyMapper);

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
</script>

<svelte:window onkeydown={keyMapper.handle_keydown.bind(keyMapper)} />

<article class="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6" data-svelty-field="content">
	<Svedit {session} {editable} path={[session.doc.document_id]} />
</article>