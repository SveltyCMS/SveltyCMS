<!--
@file src/widgets/MissingWidget.svelte 
@component
**Shows MissingWidget component to display missing widget**

@example
<MissingWidget />

### Props
- `config`: FieldType

### Features
- Translatable
-->

<script lang="ts">
	let { config } = $props();
</script>

<div class="rounded-md border border-orange-200 bg-orange-50 p-4 text-orange-700">
	<p>
		⚠️ Widget "{config.Name}" is missing or disabled.
	</p>
</div>
