<script lang="ts">
	import type { Rich_Text } from './types';

	import { language } from '$src/stores/store';
	import { PUBLIC_LANGUAGE } from '$env/static/public';

	export let field: Rich_Text;
	export let value: string = '';
	export let widgetValue: any = {};

	// Set default values
	$: !value && (value = '');
	$: widgetValue = value || {};

	// Set language
	$: _language = field.localization ? $language : PUBLIC_LANGUAGE;
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
			widgetValue = JSON.stringify(editorState);
			console.log(widgetValue);
		});
	});

	import * as z from 'zod';

	var widgetValueObject = {
		db_fieldName: field.db_fieldName,
		label: field.label,
		localization: field.localization
	};

	const richTextSchema = z.object({
		db_fieldName: z.string(),
		label: z.string().optional(),
		localization: z.boolean().optional()
	});

	let validationError: string | null = null;

	$: validationError = (() => {
		try {
			richTextSchema.parse(widgetValueObject);
			return null;
		} catch (error) {
			return (error as Error).message;
		}
	})();
</script>

<!-- TODO: save Data to Mongodb -->
<RichTextComposer theme={PlaygroundEditorTheme} bind:this={composerComponent}>
	<PlainTextPlugin />
</RichTextComposer>
