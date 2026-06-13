<!--
@file src/widgets/richText/components/VideoDialog.svelte
@component
**VideoDialog for richText editor**

@props show - boolean
@props editor - Editor

-->

<script lang="ts">
	import FloatingInput from '@components/ui/floating-input.svelte';
	import Button from '@components/ui/button.svelte';
	import type { Editor } from '@tiptap/core';
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';

	interface Props {
		editor: Editor | null;
		show?: boolean;
	}

	let { show = $bindable(false), editor }: Props = $props();

	let insertUrl = $state(false);
	let youtubeUrl = $state('');

	function close() {
		show = false;
		// Reset state after a short delay to allow the fade-out transition to complete
		setTimeout(() => {
			youtubeUrl = '';
			insertUrl = false;
		}, 200);
	}

	function handleSubmit(e: Event) {
		e.preventDefault();

		// SECURITY: Validate YouTube URL to prevent XSS
		// Only allow youtube.com and youtu.be URLs (HTTPS only)
		const youtubePattern = /^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})$/;

		if (youtubeUrl && editor) {
			if (youtubePattern.test(youtubeUrl)) {
				editor.chain().focus().setYoutubeVideo({ src: youtubeUrl }).run();
				close();
			} else {
				alert('Invalid YouTube URL. Please use a valid youtube.com or youtu.be link.');
			}
		} else {
			close();
		}
	}

	// Add 'Escape' key listener
	onMount(() => {
		const handleKeydown = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && show) {
				close();
			}
		};
		window.addEventListener('keydown', handleKeydown);
		return () => {
			window.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

{#if show}
	<div transition:fade={{ duration: 150 }} class="fixed inset-0 z-40 bg-black/30" onclick={close} role="presentation"></div>

	<div
		transition:fade={{ duration: 150 }}
		role="dialog"
		aria-modal="true"
		aria-labelledby="video-dialog-title"
		class="fixed start-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 transform rounded bg-white p-6 shadow-xl"
	>
		<button type="button" class="btn-icon btn-icon-sm absolute end-4 top-4" onclick={close} aria-label="Close">
			<iconify-icon icon="material-symbols:close" width={24}></iconify-icon>
		</button>

		<h3 id="video-dialog-title" class="mb-4 text-lg font-medium">Add Video</h3>

		{#if insertUrl}
			<form onsubmit={handleSubmit} class="relative mt-2 flex flex-col items-center justify-center gap-4">
				<FloatingInput bind:value={youtubeUrl} autofocus={true} textColor="black" name="Youtube URL" label="Youtube URL" />
				<Button type="submit" variant="primary" class="w-full">Add Video</Button>
			</form>
		{:else}
			<div class="relative mt-2 flex flex-col items-center justify-center gap-4">
				<p class="text-sm text-gray-500">Video upload is not yet implemented.</p>
				<p>or</p>
				<div class="flex w-full justify-center gap-2">
					<Button variant="outline" class="w-full" disabled>Browse locally</Button>
					<Button variant="secondary" class="w-full" onclick={() => (insertUrl = true)}>YouTube</Button>
				</div>
			</div>
		{/if}
	</div>
{/if}
