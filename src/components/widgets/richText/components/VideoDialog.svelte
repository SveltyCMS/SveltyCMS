<script lang="ts">
	import XIcon from '@src/components/system/icons/XIcon.svelte';
	import FloatingInput from '@src/components/system/inputs/floatingInput.svelte';
	import type { Editor } from '@tiptap/core';

	export let show = false;
	export let editor: Editor;
	let insert_url = false;
	let youtube_url = '';
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
	<div class="fixed left-1/2 top-0 z-10 -translate-x-1/2 bg-white">
		<XIcon class="absolute right-2 top-4 z-10 cursor-pointer" on:click={close} />
		{#if insert_url}
			<div
				class="relative mt-2 flex h-[200px] w-[500px] max-w-full select-none flex-col items-center justify-center gap-4 border-2 border-dashed border-[#c1c1c1] px-[50px]"
			>
				<FloatingInput bind:value={youtube_url} theme="light" name="Youtube URL" label="Youtube URL" />
				<button on:click={addVideo} class="btn">Add Video</button>
			</div>
		{:else}
			<div
				class="relative mt-2 flex h-[200px] w-[500px] max-w-full select-none flex-col items-center justify-center gap-4 border-2 border-dashed border-[#c1c1c1]"
			>
				<p>Drag & Drop</p>
				<p>or</p>
				<div class="flex w-full justify-center gap-2">
					<button class="btn">Browse locally</button>
					<button class="btn" on:click={() => (insert_url = true)}>YouTube</button>
				</div>
			</div>
		{/if}
	</div>
{/if}
