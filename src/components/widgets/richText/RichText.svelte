<script lang="ts">
	import type { Rich_Text } from './types';

	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';
	import { updateTranslationProgress, getFieldName } from '@utils/utils';

	// Stores
	import { contentLanguage } from '@stores/store';
	import { mode, entryData } from '@stores/store';

	export let field: FieldType;

	const fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	const _data = $mode == 'create' ? {} : value;

	$: _language = field?.translated ? $contentLanguage : publicEnv.DEFAULT_CONTENT_LANGUAGE;
	$: updateTranslationProgress(_data, field);

	const valid = true;
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
