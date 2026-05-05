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
	// Defined outside the component — allocated once, not on every render
	const ROBOTS_OPTIONS = [
		{ value: 'index, follow',      label: 'Index, Follow' },
		{ value: 'noindex, follow',    label: 'Noindex, Follow' },
		{ value: 'index, nofollow',    label: 'Index, Nofollow' },
		{ value: 'noindex, nofollow',  label: 'Noindex, Nofollow' },
		{ value: 'noarchive',          label: 'Noarchive' },
		{ value: 'nosnippet',          label: 'Nosnippet' },
		{ value: 'noimageindex',       label: 'Noimageindex' },
		{ value: 'notranslate',        label: 'Notranslate' },
	] as const;

	let { value = $bindable('index, follow') } = $props();
</script>

<label for="robots-meta-select" class="label text-black dark:text-primary-500">
	<span class="text-token">Robots Meta Data:</span>
	<select class="select" id="robots-meta-select" bind:value>
		{#each ROBOTS_OPTIONS as opt (opt.value)}
			<option value={opt.value}>{opt.label}</option>
		{/each}
	</select>
</label>
