<script lang="ts">
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	export let title;
	export let description;
	export let hostUrl;
	export let SeoPreviewToggle;
	export let togglePreview;
</script>

<div class="relative mt-2 border-t border-surface-500 dark:border-white dark:border-white dark:bg-transparent">
	<h2 class="mt-1 text-right text-xl text-white sm:text-center sm:text-2xl">
		{m.widget_seo_suggestionseopreview()}
	</h2>

	<div class="absolute left-0 top-1 flex justify-between gap-2">
		<button
			on:click={togglePreview}
			class="{SeoPreviewToggle ? 'hidden' : 'block'} variant-filled-tertiary btn btn-sm flex items-center justify-center"
		>
			<iconify-icon icon="ion:desktop-outline" width="20" class="mr-1" />
			{m.widget_seo_suggestionwidthdesktop()}
		</button>

		<button on:click={togglePreview} class="{SeoPreviewToggle ? 'block' : 'hidden'} variant-filled-tertiary btn flex items-center justify-center">
			<iconify-icon icon="bi:phone" width="18" class="mr-1" />
			{m.widget_seo_suggestionwidthmobile()}
		</button>
	</div>

	{#if SeoPreviewToggle}
		<div class="min-h-30 card variant-glass-secondary mx-auto mt-4 max-w-sm p-1 sm:p-2 md:p-4">
			<p class="flex items-center !text-xs text-surface-400">
				<iconify-icon icon="mdi:world" width="18" class="mr-2 text-white" />{hostUrl}
			</p>
			<p class="text-sm !font-medium text-primary-500 sm:px-4">
				{title}
			</p>
			<p class="mb-2 !text-sm text-black dark:text-white sm:px-4">
				{description}
			</p>
		</div>
	{:else}
		<div class="card variant-glass-secondary mt-4 p-1 sm:p-2 md:p-4">
			<p class="flex items-center !text-xs text-surface-400 sm:px-4">
				<iconify-icon icon="mdi:world" width="18" class="mr-2 text-white" />{hostUrl}
			</p>
			<p class="!font-medium text-primary-500 sm:px-4">
				{title}
			</p>
			<p class="mb-2 pb-4 text-lg text-black dark:text-white sm:px-4">
				{description}
			</p>
		</div>
	{/if}
</div>
