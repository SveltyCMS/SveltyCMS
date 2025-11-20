<!--
@file: src/routes/(app)/imageEditor/components/layout/ImageEditorFooter.svelte
@component
Layout footer for Image Editor. Embeds MasterToolbar (non-fixed) in the layout footer region.
-->
<script lang="ts">
	import MasterToolbar from '../toolbars/MasterToolbar.svelte';
</script>

<div class="w-full">
	<MasterToolbar embedded={true} />
</div>
