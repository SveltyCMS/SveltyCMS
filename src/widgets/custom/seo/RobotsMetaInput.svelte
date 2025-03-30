<!-- 
@file src/widgets/seo/RobotsMetaInput.svelte
@component
**Robots Meta widget for SEO Widget**

```tsx
<RobotsMeta bind:value={robotsMeta} />
```
#### Props
- `value` {string} - Robots meta value like: "index, follow"
-->

<script lang="ts">
	let { value = $bindable() } = $props();
</script>

<label for="robots-meta-select" class="label dark:text-primary-500 text-black">
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
