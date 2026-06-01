<!-- 
@file src/widgets/custom/json-editor/display.svelte
@component
**Read-only JSON Viewer**
-->

<script lang="ts">
	import type { FieldType } from './index';

	interface Props {
		field: FieldType;
		value: any | null | undefined;
	}

	let { value = null }: Props = $props();
	
	const displayValue = $derived(value ? JSON.stringify(value, null, 2) : 'null');
</script>

<div class="card p-4 bg-surface-900 text-tertiary-500 dark:text-primary-500 overflow-x-auto rounded-lg">
	<pre class="text-xs font-mono leading-relaxed"><code>{displayValue}</code></pre>
</div>
