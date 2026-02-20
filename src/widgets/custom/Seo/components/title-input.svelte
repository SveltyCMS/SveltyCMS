<!--
@file src/widgets/custom/Seo/components/TitleInput.svelte
@component
**Title widget for SEO Widget to manage meta title**

@example
<Title bind:title={title} bind:titleCharacterWidth={titleCharacterWidth} bind:handleTitleChange={handleTitleChange} />

#### Props
- `title` {string} - Title text
- `titleCharacterWidth` {number} - Title text character width
- `handleTitleChange` {function} - Title text change handler

#### Features
- Translatable
-->

<script lang="ts">
	interface Props {
		handleTitleChange: (event: Event) => void;
		title: string;
		titleCharacterWidth: number;
	}

	let { title = $bindable(), titleCharacterWidth, handleTitleChange }: Props = $props();

	// Compute class based on title length
	const computedClass = $derived(
		title.length >= 50 && title.length <= 60
			? 'input-label green'
			: title.length >= 30 && title.length <= 49
				? 'input-label orange'
				: title.length < 30
					? 'input-label'
					: 'input-label red'
	);

	// Compute status message based on title length
	const titleStatus = $derived(
		title.length >= 50 && title.length <= 60
			? 'Optimal length'
			: title.length >= 30 && title.length <= 49
				? 'Length is acceptable'
				: title.length < 30
					? 'Too short'
					: 'Too long'
	);
</script>

<label for="title-input" class={computedClass}>
	<div class="flex items-center justify-between">
		<div class="text-black dark:text-white">{widget_seo_suggestiontitle()}</div>
		<div class="flex flex-col text-xs sm:flex-row sm:text-base">
			<div>
				{widget_seo_suggestioncharacter()}
				<span class="text-primary-500">{title.length}</span>
			</div>
			<div>
				{widget_seo_suggestionwidthdesktop()}
				<span class="text-primary-500">{titleCharacterWidth}</span>/600px
				{widget_seo_suggestionwidthmobile()}
				<span class="text-primary-500">{titleCharacterWidth}</span>/654px
			</div>
		</div>
	</div>
	<!-- Status message for accessibility -->
	<div id="title-status" class="status-message" aria-live="polite">{titleStatus}</div>
</label>

<input
	id="title-input"
	type="text"
	class="input text-black dark:text-primary-500"
	placeholder={widget_seo_suggestionseotitle()}
	required
	bind:value={title}
	oninput={handleTitleChange}
	aria-describedby="title-status"
/>

<style>
	.input-label {
		color: gray;
	}
	.input-label.green {
		color: green;
	}
	.input-label.orange {
		color: orange;
	}
	.input-label.red {
		color: red;
	}
	.status-message {
		margin-top: 0.25rem;
		font-size: 0.875rem;
	}
</style>
