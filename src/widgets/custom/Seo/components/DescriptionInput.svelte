<!--
@file src/widgets/custom/Seo/components/DescriptionInput.svelte
@component
**Description widget for SEO Widget to manage meta description**

@example
<Description bind:description={description} bind:descriptionCharacterWidth={descriptionCharacterWidth} bind:handleDescriptionChange={handleDescriptionChange} />

#### Props
- `description` {string} - Description text
- `descriptionCharacterWidth` {number} - Description character width
- `handleDescriptionChange` {function} - Function to handle description changes

### Features
- Translatable
-->

<script lang="ts">
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	interface Props {
		description: string;
		descriptionCharacterWidth: number;
		handleDescriptionChange: (event: Event) => void;
	}

	let { description = $bindable(), descriptionCharacterWidth, handleDescriptionChange }: Props = $props();

	// Compute class based on description length
	const computedClass = $derived(
		description.length >= 120 && description.length <= 165
			? 'input-label green'
			: description.length >= 30 && description.length <= 119
				? 'input-label orange'
				: description.length < 30
					? 'input-label'
					: 'input-label red'
	);

	// Compute status message based on description length
	const descriptionStatus = $derived(
		description.length >= 120 && description.length <= 165
			? 'Optimal length'
			: description.length >= 30 && description.length <= 119
				? 'Length is acceptable'
				: description.length < 30
					? 'Too short'
					: 'Too long'
	);
</script>

<label for="description-input" class={computedClass}>
	<div class="flex justify-between">
		<div class="text-black dark:text-white">{m.widget_seo_suggestiondescription()}</div>
		<div class="flex flex-col text-xs sm:flex-row sm:text-base">
			<div>
				{m.widget_seo_suggestioncharacter()}
				<span class="text-primary-500">{description.length}</span>
			</div>
			<div>
				{m.widget_seo_suggestionwidthdesktop()}
				<span class="text-primary-500">{descriptionCharacterWidth}</span>/970px
				{m.widget_seo_suggestionwidthmobile()}
				<span class="text-primary-500">{descriptionCharacterWidth}</span>/981px
			</div>
		</div>
	</div>
	<!-- Status message for accessibility -->
	<div class="status-message" aria-live="polite">{descriptionStatus}</div>
</label>

<textarea
	id="description-input"
	name="description-input"
	placeholder={m.widget_seo_suggestionseodescription()}
	rows="2"
	cols="50"
	bind:value={description}
	oninput={handleDescriptionChange}
	class="input text-black dark:text-primary-500"
	aria-describedby="description-status"
></textarea>

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
		font-size: 0.875rem;
		margin-top: 0.25rem;
	}
</style>
