<script lang="ts">
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	export let description;
	export let descriptionCharacterWidth;
	export let handleDescriptionChange;
</script>

<label
	class={description.length >= 120 && description.length <= 165
		? 'input-label green'
		: description.length >= 30 && description.length <= 129
			? 'input-label orange'
			: description.length < 30
				? 'input-label'
				: 'input-label red'}
>
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
</label>

<textarea
	id="description-input"
	name="description-input"
	placeholder={m.widget_seo_suggestionseodescription()}
	rows="2"
	cols="50"
	bind:value={description}
	on:input={handleDescriptionChange}
	class="input text-black dark:text-primary-500"
/>
