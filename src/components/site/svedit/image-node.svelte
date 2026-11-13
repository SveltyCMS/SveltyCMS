<!--
@file src/components/site/svedit/image-node.svelte
@component Svedit image block with drag-drop upload and focal point.

Drops upload through `POST /api/media/upload` (the same media pipeline as the
admin gallery, so thumbnails/variants are generated server-side). The focal
point is stored as two percentages and applied with `object-position`.

@props
- `path` — Svedit node path.

### Features
- drag-drop or file-picker upload
- click / arrow-key focal point (5% steps, Shift = 10%)
- accessible replace/remove controls and alt text
-->

<script lang="ts">
	import { getContext } from 'svelte';
	import { Node, TextProperty, type SveditContext } from 'svedit';
	import { mediaUrl } from '@utils/media/media-utils';
	import { clientJsonHeaders } from '@utils/security/client-csrf';
	import type { MediaItem } from '@utils/media/media-models';

	interface Props {
		path: Array<string | number>;
	}

	let { path }: Props = $props();

	const svedit = getContext<SveditContext>('svedit');
	const editable = $derived(svedit.editable);

	const src = $derived(String(svedit.session.get([...path, 'src']) ?? ''));
	const focalX = $derived(Number(svedit.session.get([...path, 'focalX']) ?? 50));
	const focalY = $derived(Number(svedit.session.get([...path, 'focalY']) ?? 50));
	const altText = $derived(
		String(
			(svedit.session.get([...path, 'alt']) as { content?: string } | undefined)?.content ?? ''
		)
	);

	let uploading = $state(false);
	let uploadError = $state<string | null>(null);

	function setProp(key: string, value: unknown) {
		const session = svedit.session;
		const tr = session.tr;
		tr.set([...path, key], value);
		session.apply(tr);
	}

	function clampPercent(value: number): number {
		return Math.min(100, Math.max(0, Math.round(value)));
	}

	async function upload(file: File) {
		if (!file.type.startsWith('image/')) {
			uploadError = 'Only image files can be added here.';
			return;
		}
		uploading = true;
		uploadError = null;
		try {
			const form = new FormData();
			form.append('files', file);
			const response = await fetch('/api/media/upload', {
				method: 'POST',
				body: form,
				// FormData sets its own multipart boundary; only the CSRF token travels here.
				headers: { 'X-CSRF-Token': clientJsonHeaders()['X-CSRF-Token'] || '' },
				credentials: 'include'
			});
			const body = await response.json().catch(() => null);
			const result = Array.isArray(body?.data)
				? body.data.find((entry: { success?: boolean }) => entry?.success)
				: null;
			const media = result?.data as MediaItem | undefined;
			if (!response.ok || !media) {
				throw new Error(body?.message || `Upload failed (HTTP ${response.status})`);
			}
			setProp('src', mediaUrl(media));
		} catch (err) {
			uploadError = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			uploading = false;
		}
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		if (!editable) return;
		const file = event.dataTransfer?.files?.[0];
		if (file) void upload(file);
	}

	function handlePick(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (file) void upload(file);
		// Allow re-picking the same file after a failed upload.
		input.value = '';
	}

	function setFocalFromPointer(event: MouseEvent) {
		if (!editable || !src) return;
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		setProp('focalX', clampPercent(((event.clientX - rect.left) / rect.width) * 100));
		setProp('focalY', clampPercent(((event.clientY - rect.top) / rect.height) * 100));
	}

	function nudgeFocal(event: KeyboardEvent) {
		if (!editable || !src) return;
		const step = event.shiftKey ? 10 : 5;
		if (event.key === 'ArrowLeft') setProp('focalX', clampPercent(focalX - step));
		else if (event.key === 'ArrowRight') setProp('focalX', clampPercent(focalX + step));
		else if (event.key === 'ArrowUp') setProp('focalY', clampPercent(focalY - step));
		else if (event.key === 'ArrowDown') setProp('focalY', clampPercent(focalY + step));
		else return;
		event.preventDefault();
	}
</script>

<Node {path}>
	{#if src}
		<figure
			class="relative mb-8 overflow-hidden rounded-xl border border-surface-500/20"
			ondragover={(event) => editable && event.preventDefault()}
			ondrop={handleDrop}
		>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<img
				{src}
				alt={altText}
				class="max-h-125 w-full object-cover"
				style:object-position="{focalX}% {focalY}%"
				onclick={setFocalFromPointer}
				onkeydown={nudgeFocal}
				role={editable ? 'button' : undefined}
				tabindex={editable ? 0 : undefined}
				aria-label={editable ? 'Set the focal point (arrow keys to adjust)' : undefined}
			/>
			{#if editable}
				<span
					class="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary-500 shadow"
					style:left="{focalX}%"
					style:top="{focalY}%"
					aria-hidden="true"
				></span>
				<figcaption class="flex flex-col gap-2 p-2">
					<TextProperty
						path={[...path, 'alt']}
						placeholder="Alt text"
						class="text-sm text-surface-500"
					/>
					<div class="flex flex-wrap items-center gap-2">
						<label
							class="inline-flex h-10 items-center rounded-md border border-surface-500/30 bg-surface-500/10 px-3 text-sm font-medium"
						>
							Replace image
							<input
								type="file"
								accept="image/*"
								class="sr-only"
								aria-label="Replace image"
								onchange={handlePick}
							/>
						</label>
						<button
							type="button"
							class="inline-flex h-10 items-center rounded-md border border-error-500/40 px-3 text-sm font-medium text-error-500 hover:bg-error-500/10"
							onclick={() => setProp('src', '')}
						>
							Remove
						</button>
						{#if uploading}
							<span class="text-xs text-surface-500" role="status">Uploading…</span>
						{/if}
						{#if uploadError}
							<span class="text-xs text-error-500" role="alert">{uploadError}</span>
						{/if}
					</div>
				</figcaption>
			{/if}
		</figure>
	{:else if editable}
		<div
			class="mb-8 flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-surface-500/40 bg-surface-500/10 p-6 text-center"
			ondragover={(event) => event.preventDefault()}
			ondrop={handleDrop}
			role="group"
			aria-label="Add an image"
		>
			<p class="text-sm text-surface-500">
				{uploading ? 'Uploading image…' : 'Drop an image here, or'}
			</p>
			<label
				class="inline-flex h-10 items-center rounded-md border border-surface-500/30 bg-surface-500/10 px-3 text-sm font-medium"
			>
				Choose a file
				<input
					type="file"
					accept="image/*"
					class="sr-only"
					aria-label="Choose an image file"
					onchange={handlePick}
				/>
			</label>
			{#if uploadError}
				<p class="text-sm text-error-500" role="alert">{uploadError}</p>
			{/if}
		</div>
	{/if}
</Node>
