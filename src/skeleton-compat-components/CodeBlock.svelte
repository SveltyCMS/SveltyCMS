<script lang="ts">
	// CodeBlock compat component
	interface Props {
		code?: string;
		language?: string;
		[key: string]: any;
	}
	
	let { code = '', language = 'text', ...rest }: Props = $props();
</script>

<pre class="code-block bg-surface-900 text-surface-50 p-4 rounded overflow-x-auto" {...rest}><code class="language-{language}">{code}</code></pre>
