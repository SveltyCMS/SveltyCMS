<script lang="ts">
	//@ts-ignore
	import { RichTextComposer, PlainTextPlugin } from 'svelte-lexical';
	//@ts-ignore
	import PlaygroundEditorTheme from './PlaygroundEditorTheme';
	import './global.css';
	import { onMount } from 'svelte';
	let composerComponent: RichTextComposer;
	onMount(() => {
		const editor = composerComponent.getEditor();
		editor.registerUpdateListener(({ editorState }) => {
			console.log(JSON.stringify(editorState));
		});
	});
</script>

<!-- TODO: save Data to Mongodb -->
<RichTextComposer theme={PlaygroundEditorTheme} bind:this={composerComponent}>
	<PlainTextPlugin />
</RichTextComposer>
