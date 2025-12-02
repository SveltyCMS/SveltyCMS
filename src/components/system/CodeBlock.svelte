<!--
@file src/components/system/CodeBlock.svelte
@component
Compatibility wrapper for displaying code blocks.
Provides v2-like CodeBlock API using simple pre/code elements with syntax highlighting.
-->

<script lang="ts">
	let {
		code = '',
		language = 'plaintext',
		lineNumbers = false,
		...restProps
	}: {
		code?: string;
		language?: string;
		lineNumbers?: boolean;
		class?: string;
		[key: string]: unknown;
	} = $props();

	// Format JSON if applicable
	const formattedCode = $derived.by(() => {
		if (language === 'json' && typeof code === 'string') {
			try {
				return JSON.stringify(JSON.parse(code), null, 2);
			} catch {
				return code;
			}
		}
		return code;
	});

	const lines = $derived(formattedCode.split('\n'));
</script>

<div class="code-block-wrapper rounded-lg bg-surface-900 p-4 text-sm {restProps.class || ''}" {...restProps}>
	<div class="mb-2 flex items-center justify-between">
		<span class="text-xs uppercase text-surface-400">{language}</span>
		<button
			type="button"
			class="text-xs text-surface-400 hover:text-surface-200"
			onclick={() => navigator.clipboard.writeText(formattedCode)}
		>
			Copy
		</button>
	</div>
	<pre class="overflow-x-auto"><code class="language-{language} text-surface-100">{#if lineNumbers}{#each lines as line, i}<span class="mr-4 inline-block w-8 text-right text-surface-500 select-none">{i + 1}</span>{line}
{/each}{:else}{formattedCode}{/if}</code></pre>
</div>
