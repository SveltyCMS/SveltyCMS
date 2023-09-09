<script lang="ts">
	import type { Rich_Text } from './types';
	import type { FieldType } from '.';

	import { contentLanguage, defaultContentLanguage } from '@src/stores/store';
	import { mode, entryData } from '@src/stores/store';
	import { getFieldName } from '@src/utils/utils';

	export let field: FieldType;

	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	let _data = $mode == 'create' ? {} : value;
	let _language = field?.translated ? $contentLanguage : defaultContentLanguage;
	let valid = true;
	export const WidgetData = async () => _data;

	//@ts-ignore
	import { RichTextComposer, PlainTextPlugin } from 'svelte-lexical';
	//@ts-ignore
	import PlaygroundEditorTheme from './PlaygroundEditorTheme';
	import './global.css';
	import { onMount } from 'svelte';
	let composerComponent: RichTextComposer;

	onMount(() => {
		const editor = composerComponent.getEditor();
		editor.registerUpdateListener(({ editorState }: { editorState: any }) => {
			value = editorState;
		});
	});

	import * as z from 'zod';

	var widgetValueObject = {
		db_fieldName: field.db_fieldName,
		label: field.label
		// translated: field.translated
	};

	const richTextSchema = z.object({
		db_fieldName: z.string(),
		label: z.string().optional(),
		translated: z.boolean().optional()
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
