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
	import Select from '@components/ui/select.svelte';

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
		];

	let { value = $bindable('index, follow') } = $props();
</script>

<Select
	id="robots-meta-select"
	label="Robots Meta Data"
	bind:value
	options={ROBOTS_OPTIONS}
/>
