<!--
@file apps/cms/src/widgets/core/Input/Display.svelte
@component
**Text Input Widget Display Component**

Renders multilingual text content with automatic truncation for list views.
Part of the Three Pillars Architecture for widget system.

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
	import { app } from '@shared/stores/store.svelte';
	import { publicEnv } from '@shared/stores/globalSettings.svelte';
	import type { FieldType } from './';

	const { field, value }: { field: FieldType; value: Record<string, any> | null | undefined } = $props();
	// Determine the current language (uses store API from contentLanguage)
	const lang = $derived(
		field?.translated ? app.contentLanguage.toLowerCase() : ((publicEnv.DEFAULT_CONTENT_LANGUAGE as string) || 'en').toLowerCase()
	);

	// ✨ IMPROVED: Separate truncation logic from display logic for better performance
	const fullText = $derived(value?.[lang] ?? value?.[Object.keys(value || {})[0]] ?? '–');
	const shouldTruncate = $derived(typeof fullText === 'string' && fullText.length > 50);
	const displayText = $derived(shouldTruncate ? `${fullText.substring(0, 50)}...` : fullText);
</script>

<!-- ✨ IMPROVED: Better accessibility and visual truncation -->
<span
	class="truncate"
	class:cursor-help={shouldTruncate}
	title={shouldTruncate ? fullText : undefined}
	aria-label={shouldTruncate ? `${displayText} (truncated, full text: ${fullText})` : undefined}
>
	{displayText}
</span>
