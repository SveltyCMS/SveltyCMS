<!--
@file src/widgets/core/Input/Display.svelte
@component
**Text Input Widget Display Component**

Renders multilingual text content with automatic truncation for list views.
Part of the Three Pillars Architecture for widget system.

@example
<TextDisplay field={fieldDefinition} value={{ en: "Hello World", de: "Hallo Welt" }} />
Renders current language text with truncation for long content 

### Props
- `field: FieldType` - Widget field definition with translation settings
- `value: string | Record<string, unknown> | null | undefined` - Localized string or multilingual text object

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
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { app } from '@src/stores/store.svelte';
	import type { FieldType } from './';

	const { field, value }: { field: FieldType; value: string | Record<string, unknown> | null | undefined } = $props();
	// Determine the current language (uses store API from contentLanguage)
	const lang = $derived(
		field?.translated ? app.contentLanguage.toLowerCase() : ((publicEnv.DEFAULT_CONTENT_LANGUAGE as string) || 'en').toLowerCase()
	);
	const isTitleField = $derived(/^(title|name)$/i.test(String(field?.db_fieldName || field?.label || '')));
	const emptyFallback = $derived(isTitleField ? 'Untitled' : '–');

	const fullText = $derived.by(() => {
		if (value == null) return emptyFallback;
		if (typeof value === 'string') {
			return value.trim() === '' ? emptyFallback : value;
		}
		if (typeof value === 'number' || typeof value === 'boolean') {
			return String(value);
		}
		if (typeof value === 'object' && !Array.isArray(value)) {
			const rec = value as Record<string, unknown>;
			const hit = rec[lang] ?? rec[Object.keys(rec)[0] ?? ''];
			if (typeof hit === 'string') return hit.trim() === '' ? emptyFallback : hit;
			if (typeof hit === 'number' || typeof hit === 'boolean') return String(hit);
		}
		return emptyFallback;
	});
	const isPlaceholder = $derived(isTitleField && fullText === 'Untitled');
	const shouldTruncate = $derived(typeof fullText === 'string' && fullText.length > 50 && !isPlaceholder);
	const displayText = $derived(shouldTruncate ? `${fullText.substring(0, 50)}...` : fullText);
</script>

<span
	class="truncate"
	class:cursor-help={shouldTruncate}
	class:italic={isPlaceholder && isTitleField}
	style={isPlaceholder && isTitleField ? 'color: var(--admin-text-muted)' : undefined}
	title={shouldTruncate ? fullText : undefined}
	aria-label={isPlaceholder && isTitleField ? 'Untitled' : shouldTruncate ? `${displayText} (truncated, full text: ${fullText})` : undefined}
>
	{displayText}
</span>
