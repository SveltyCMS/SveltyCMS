<!--
@file src/widgets/core/slug/display.svelte
@component
**Slug widget display** for list cells.

### Props
- `value`: slug string, or a locale map

### Features
- Shows the slug text
- Truncates long values
-->

<script lang="ts">
	const { value }: { value?: string | Record<string, string> | null } = $props();

	const text = $derived.by(() => {
		if (typeof value === 'string') return value || '–';
		if (value && typeof value === 'object') {
			const first = Object.values(value).find((item) => typeof item === 'string' && item);
			return first || '–';
		}
		return '–';
	});
</script>

<span class="truncate" title={text}>{text}</span>
