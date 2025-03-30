<!--
@file src/widgets/richText/components/VideoDialog.svelte
@component
**VideoDialog for richText editor**

@props show - boolean
@props editor - Editor

-->

<script lang="ts">
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';
	import type { Editor } from '@tiptap/core';

	interface Props {
		show?: boolean;
		editor: Editor;
	}

	let { show = $bindable(false), editor }: Props = $props();
	let insert_url = $state(false);
	let youtube_url = $state('');
	function addVideo() {
		editor.chain().focus().setYoutubeVideo({ src: youtube_url }).run();
		youtube_url = '';
		show = false;
		insert_url = false;
	}
	function close() {
		youtube_url = '';
		show = false;
		insert_url = false;
	}
</script>

{#if show}
	<div class="fixed top-0 left-1/2 z-10 -translate-x-1/2 bg-white">
		<iconify-icon
			icon="material-symbols:close"
			width="32"
			role="button"
			aria-label="Close"
			class="absolute top-4 right-2 z-10 cursor-pointer"
			onclick={close}
			onkeydown={(e) => e.key === 'Enter' && close()}
			tabindex="0"
		></iconify-icon>

		{#if insert_url}
			<div
				class="relative mt-2 flex h-[200px] w-[500px] max-w-full flex-col items-center justify-center gap-4 border-2 border-dashed border-[#c1c1c1] px-[50px] select-none"
			>
				<FloatingInput bind:value={youtube_url} textColor="black" name="Youtube URL" label="Youtube URL" />
				<button onclick={addVideo} class="btn">Add Video</button>
			</div>
		{:else}
			<div
				class="relative mt-2 flex h-[200px] w-[500px] max-w-full flex-col items-center justify-center gap-4 border-2 border-dashed border-[#c1c1c1] select-none"
			>
				<p>Drag & Drop</p>
				<p>or</p>
				<div class="flex w-full justify-center gap-2">
					<button class="btn">Browse locally</button>
					<button class="btn" onclick={() => (insert_url = true)}>YouTube</button>
				</div>
			</div>
		{/if}
	</div>
{/if}
