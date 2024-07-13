<script lang="ts">
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	export let value;
</script>

<label for="robots-meta-select" class="label text-black dark:text-primary-500">
	<span class="text-token">Robots Meta Data:</span>
	<select class="select" id="robots-meta-select" bind:value>
		<option value="index, follow">Index, Follow</option>
		<option value="noindex, follow">Noindex, Follow</option>
		<option value="index, nofollow">Index, Nofollow</option>
		<option value="noindex, nofollow">Noindex, Nofollow</option>
		<option value="noarchive">Noarchive</option>
		<option value="nosnippet">Nosnippet</option>
		<option value="noimageindex">Noimageindex</option>
		<option value="notranslate">Notranslate</option>
	</select>
</label>
