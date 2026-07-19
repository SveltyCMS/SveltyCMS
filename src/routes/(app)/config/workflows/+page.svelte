<!--
@file src/routes/(app)/config/workflows/+page.svelte
@component
**Content workflow builder page** — wraps the visual FSM editor.
-->
<script lang="ts">
	import WorkflowBuilder from "./workflow-builder.svelte";
</script>

<div data-testid="workflows-page" class="contents">
	<WorkflowBuilder />
</div>
