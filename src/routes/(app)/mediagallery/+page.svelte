<script lang="ts">
	import { onMount } from 'svelte';
	import MediaGallery from '@src/components/MediaGallery.svelte';
	import { mode } from '@src/stores/store';

	onMount(() => {
		mode.set('media');
	});
</script>

<MediaGallery />
