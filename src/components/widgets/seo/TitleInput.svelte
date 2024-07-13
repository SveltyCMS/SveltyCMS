<script lang="ts">
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	export let title;
	export let titleCharacterWidth;
	export let handleTitleChange;
</script>

<label
	for="title-input"
	class={title.length >= 50 && title.length <= 60
		? 'input-label green'
		: title.length >= 30 && title.length <= 49
			? 'input-label orange'
			: title.length < 30
				? 'input-label'
				: 'input-label red'}
>
	<div class="flex items-center justify-between">
		<div class="text-black dark:text-white">{m.widget_seo_suggestiontitle()}</div>
		<div class="flex flex-col text-xs sm:flex-row sm:text-base">
			<div>
				{m.widget_seo_suggestioncharacter()}
				<span class="text-primary-500">{title.length}</span>
			</div>
			<div>
				{m.widget_seo_suggestionwidthdesktop()}
				<span class="text-primary-500">{titleCharacterWidth}</span>/600px {m.widget_seo_suggestionwidthmobile()}
				<span class="text-primary-500">{titleCharacterWidth}</span>/654px
			</div>
		</div>
	</div>
</label>

<input
	id="title-input"
	type="text"
	class="input text-black dark:text-primary-500"
	placeholder={m.widget_seo_suggestionseotitle()}
	required
	bind:value={title}
	on:input={handleTitleChange}
/>
