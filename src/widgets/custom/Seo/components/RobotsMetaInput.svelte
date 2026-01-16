<!--
@file src/widgets/custom/Seo/components/RobotsMetaInput.svelte
@component
**Robots Meta widget for SEO Widget to manage robots meta data**

@example
<RobotsMeta bind:value={robotsMeta} />

#### Props
- `robotsMeta` {string} - Robots meta data

#### Features
- Translatable
-->

<script lang="ts">
	let { value = $bindable() } = $props();
</script>

<label for="robots-meta-select" class="label text-black dark:text-primary-500">
	<span class="base-font-color">Robots Meta Data:</span>
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
