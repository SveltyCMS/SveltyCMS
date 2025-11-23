<!--
  Skeleton v2 CodeBlock compatibility stub
  Use a proper code highlighting library instead
-->
<script lang="ts">
const { 
language = '',
code = '',
...props
} = $props<{
language?: string;
code?: string;
[key: string]: any;
}>();
</script>

<pre class="code-block"><code>{code}</code></pre>

<style lang="postcss">
@import "tailwindcss";
.code-block {
@apply rounded-md p-4 text-sm;
background-color: var(--color-surface-100);
overflow-x: auto;
}
:global(.dark) .code-block {
background-color: var(--color-surface-800);
}
</style>
