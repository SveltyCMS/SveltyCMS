<!-- 
@file src/components/widgets/richTextLexical/RichText.svelte
@description - RichText Lexical widget
-->

<script lang="ts">
	import type { Rich_Text } from './types';
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';
	import { updateTranslationProgress, getFieldName } from '@utils/utils';

	// Stores
	import { contentLanguage } from '@stores/store';
	import { mode, collectionValue } from '@stores/collectionStore';

	// Valibot validation
	import { object, string, boolean, optional, pipe, parse, type InferInput, type ValiError } from 'valibot';

	export let field: FieldType;

	const fieldName = getFieldName(field);
	export let value = $collectionValue[fieldName] || {};

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

	// Define validation schema
	const richTextSchema = object({
		db_fieldName: string(),
		label: optional(string()),
		translated: optional(boolean())
	});

	type RichTextSchemaType = InferInput<typeof richTextSchema>;

	const widgetValueObject = {
		db_fieldName: field.db_fieldName,
		label: field.label
	};

	let validationError: string | null = null;

	$: validationError = (() => {
		try {
			parse(richTextSchema, widgetValueObject);
			return null;
		} catch (error) {
			if ((error as ValiError<typeof richTextSchema>).issues) {
				const valiError = error as ValiError<typeof richTextSchema>;
				return valiError.issues[0]?.message || 'Invalid input';
			}
			return (error as Error).message;
		}
	})();
</script>

<!-- TODO: save Data to Mongodb -->
<RichTextComposer theme={PlaygroundEditorTheme} bind:this={composerComponent}>
	<PlainTextPlugin />
</RichTextComposer>
