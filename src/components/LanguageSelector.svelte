<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import { contentLanguage, translationProgress, mode } from '@src/stores/store';
	import { get } from 'svelte/store';

	const languages = publicEnv.AVAILABLE_CONTENT_LANGUAGES;

	export let label: string = '';

	let expanded = false;

	// Subscribe to mode changes
	mode.subscribe(($mode) => {
		if ($mode !== 'view') {
			translationProgress.set({ show: true });
		} else {
			translationProgress.set({ show: false });
		}
	});

	// Set the default content language if not set
	if (!get(contentLanguage)) {
		contentLanguage.set(languages[0]);
	}
</script>

<div class="rounded-lg bg-surface-500">
	<button
		on:click={() => (expanded = !expanded)}
		class="flex w-full cursor-pointer items-center justify-evenly border-b border-gray-300 p-2"
		class:selected={expanded}
	>
		<iconify-icon icon="clarity:language-solid" width="24" />
		<p class="relative select-none px-4 py-2 text-center text-white">{($contentLanguage || label).toUpperCase()}</p>
	</button>
	{#if expanded}
		<div class="absolute right-0 top-full mt-2 w-48 rounded-lg bg-surface-500 shadow-lg">
			{#each languages as lang}
				{#if $translationProgress.show}
					<button
						class="hover:bg-aqua flex w-full items-center justify-between p-2"
						on:click={() => {
							contentLanguage.set(lang);
							expanded = false;
						}}
					>
						<p>{lang.toUpperCase()}</p>
						<div class="flex items-center space-x-2">
							<div class="h-1.5 w-24 bg-white">
								<div
									class="h-1.5 bg-primary-500 transition-all"
									style="width: {($translationProgress[lang]?.translated.size * 100) / $translationProgress[lang]?.total.size}%"
								></div>
							</div>
							<p>{(($translationProgress[lang]?.translated.size ?? 1) * 100) / $translationProgress[lang]?.total.size ?? 100}%</p>
						</div>
					</button>
				{:else}
					<button
						class="hover:bg-aqua w-full p-2"
						on:click={() => {
							contentLanguage.set(lang);
							expanded = false;
						}}
					>
						{lang.toUpperCase()}
					</button>
				{/if}
			{/each}
		</div>
	{/if}
</div>
