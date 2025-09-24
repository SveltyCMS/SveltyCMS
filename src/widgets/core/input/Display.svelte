<!--
@file src/widgets/core/input/Display.svelte
@component
**Text Input Widget Display Component**

Renders multilingual text content with automatic truncation for list views.
Part of the Three Pillars Architecture for enterprise-ready widget system.

@example
<TextDisplay field={fieldDefinition} value={{ en: "Hello World", de: "Hallo Welt" }} />
Renders current language text with truncation for long content 

### Props
- `field: FieldType` - Widget field definition with translation settings
- `value: Record<string, string> | null | undefined` - Multilingual text object

### Features
- **Multilingual Display**: Shows text in current content language automatically
- **Smart Truncation**: Truncates text longer than 50 characters for list display
- **Tooltip Support**: Full text available on hover via title attribute
- **Language Awareness**: Respects field translation settings and content store
- **Fallback Handling**: Graceful handling of missing or null values
- **Performance Optimized**: Efficient text processing with `$derived.by()`
- **Responsive Design**: Optimized for both detail and list view contexts
-->

<script lang="ts">
	import { contentLanguage } from '@src/stores/store.svelte';
	import type { FieldType } from './';

	let { field, value }: { field: FieldType; value: Record<string, string> | null | undefined } = $props();

	// Determine the current language.
	const lang = $derived(field.translated ? $contentLanguage : 'default');

	// Get and truncate the text for the current language.
	const displayText = $derived.by(() => {
		const text = value?.[lang] ?? '–';
		// Truncate text longer than 50 characters for display in lists.
		return text.length > 50 ? text.substring(0, 50) + '...' : text;
	});
</script>

<span title={value?.[lang]}>{displayText}</span>
