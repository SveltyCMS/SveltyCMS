<script lang="ts">
	// Here’s a breakdown of how the score is calculated for each check:

	// Title length: If the title is more than 50 characters, the title_score is set to 3.
	// Description length: If the description is between 120 and 165 characters, the description_score is set to 3.
	// Number of sentences in the description: If the description contains between 2 and 4 sentences, the sentences_score is set to 3.
	// Presence of numbers in the title: If the title contains a number, the title_numbers_score is set to 3.
	// Presence of power words in the title: If the title contains a power word, the title_power_words_score is set to 3.
	// Presence of power words in the description: If the description contains a power word, the description_power_words_score is set to 3.
	// Presence of CTA keywords in the title: If the title contains a CTA keyword, the title_CTA_score is set to 3.
	// Presence of CTA keywords in the description: If the description contains a CTA keyword, the description_CTA_score is set to 3

	// If all of these checks have an impact of 3, then you should get a maximum score of 24 (8 checks * 3 points per check)

	import type { FieldType } from '.';
	import { contentLanguage, defaultContentLanguage } from '@src/stores/store';
	import { mode, entryData } from '@src/stores/store';
	import { getFieldName } from '@src/utils/utils';

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';

	// skeleton
	import { ProgressRadial } from '@skeletonlabs/skeleton';

	export let field: FieldType;

	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	let _data = $mode == 'create' ? {} : value;
	// console.log(_data);
	let _language = field?.translated ? $contentLanguage : defaultContentLanguage;

	export const WidgetData = async () => _data;

	//save both fields
	if (!_data[_language]) {
		_data[_language] = {};
	}

	_data[_language] = {
		...value,
		title: _data[_language].title || '',
		description: _data[_language].description || ''
	};

	// get current page url
	import { onMount } from 'svelte';

	let hostUrl: any;

	onMount(() => {
		hostUrl = window.location.origin;
	});

	let title = '';
	if (value.title) {
		title = value.title;
	}
	let description = '';
	if (value.description) {
		description = value.description;
	}
	let titleCharacterWidth = 0;
	let descriptionCharacterWidth = 0;
	let SeoPreviewToggle = false;

	function calculateCharacterWidth(character: string, fontSize: number, fontFamily: string) {
		const span = document.createElement('span');
		span.style.fontSize = `${fontSize}px`;
		span.style.fontFamily = fontFamily;
		span.innerHTML = character;
		document.body.appendChild(span);
		const characterWidth = span.offsetWidth;
		document.body.removeChild(span);
		return characterWidth;
	}

	function handleTitleChange(event: Event) {
		title = (event.target as HTMLInputElement).value;
		titleCharacterWidth = calculateCharacterWidth(title, 16, 'Arial');
		suggestions = analyze(title, description);
	}

	function handleDescriptionChange(event: Event) {
		description = (event.target as HTMLInputElement).value;
		descriptionCharacterWidth = calculateCharacterWidth(description, 14, 'Arial');
		suggestions = analyze(title, description);
	}

	// Function to analyze the title and  description
	let score = 0;

	// Display correct Radial dial score based on 3 points per function
	let progress = 0;
	$: progress = Math.round((score / (8 * 3)) * 100);

	let suggestions = analyze(title, description);

	function analyze(title: string, description: string) {
		let scores = {
			title_score: 0,
			description_score: 0,
			sentences_score: 0,
			title_numbers_score: 0,
			title_power_words_score: 0,
			description_power_words_score: 0,
			title_CTA_score: 0,
			description_CTA_score: 0
		};

		let suggestions: any = [];

		// Check if the title is more than 50 characters
		if (title.length > 50) {
			suggestions.push({
				text: $LL.WIDGET_Seo_Suggestion_TitlePerfect(),
				impact: 3
			});
			scores.title_score = 3;
		}
		// Check if the title is more than 30 characters
		else if (title.length > 30) {
			suggestions.push({
				text: $LL.WIDGET_Seo_Suggestion_TitleGood(),
				impact: 2
			});

			scores.title_score = 2;
		}
		// Otherwise, the title is less than 30 characters
		else if (title.length > 0) {
			suggestions.push({
				text: $LL.WIDGET_Seo_Suggestion_TitleBad(),
				impact: 1
			});
			scores.title_score = 1;
		}

		// Check if the description is between 120 and 165 characters
		if (description.length >= 120 && description.length <= 165) {
			suggestions.push({
				text: $LL.WIDGET_Seo_Suggestion_DescriptionPerfect(),
				impact: 3
			});
			scores.description_score = 3;
		}
		// Check if the description is more than 90 characters
		else if (description.length > 90) {
			suggestions.push({
				text: $LL.WIDGET_Seo_Suggestion_DescriptionGood(),
				impact: 2
			});

			scores.description_score = 2;
		}
		// Otherwise, the description is less than 90 characters
		else if (description.length > 0) {
			suggestions.push({
				text: $LL.WIDGET_Seo_Suggestion_DescriptionBad(),
				impact: 1
			});
			scores.description_score = 1;
		}

		// Check if the meta description is 2 to 4 sentences long
		const sentences = description.split('.').filter((x) => x.length > 1);
		if (sentences.length >= 2 && sentences.length <= 4) {
			suggestions.push({
				text: $LL.WIDGET_Seo_Suggestion_SentencePerfect(),
				impact: 3
			});
			scores.sentences_score = 3;
		} else if (sentences.length > 0) {
			suggestions.push({
				text: $LL.WIDGET_Seo_Suggestion_SentenceGood(),
				impact: 2
			});
		} else {
			suggestions.push({
				text: $LL.WIDGET_Seo_Suggestion_SentenceBad(),
				impact: 1
			});
			scores.sentences_score = 0;
		}

		// Check if the title uses numbers
		if (title.length > 0 && /\d/.test(title)) {
			suggestions.push({
				text: $LL.WIDGET_Seo_Suggestion_NumberPerfect(),
				impact: 3
			});
			scores.title_numbers_score = 3;
		} else if (title.length > 0) {
			suggestions.push({
				text: $LL.WIDGET_Seo_Suggestion_NumberBad(),
				impact: 1
			});
			scores.title_numbers_score = 0;
		}

		// Check if the title has a power word
		const powerWords = Object.values($LL.WIDGET_SEO_PowerWords).map((fn) => fn().toString());

		for (const word of powerWords) {
			if (title.toLowerCase().includes(word)) {
				suggestions.push({
					text: $LL.WIDGET_Seo_Suggestion_PowerWordTitle(),
					// TODO: Add Variable  ${word} to translation
					// text: `Your title has the Power Word ${word}. Perfect!`,
					impact: 3
				});
				scores.title_power_words_score = 3;
				break;
			}
		}

		// Check if the meta description has a power word
		for (const word of powerWords) {
			if (description.toLowerCase().includes(word)) {
				suggestions.push({
					text: $LL.WIDGET_Seo_Suggestion_PowerWordDescription(),
					// TODO: Add Variable   ${word} to translation
					// text: `Your description uses the Power Word ${word}. Perfect!`,
					impact: 3
				});
				scores.description_power_words_score = 3;

				break;
			}
		}

		// Define the list of CTA keywords
		const ctaKeywords = Object.values($LL.WIDGET_SEO_ctaKeywords).map((fn) => fn().toString());

		// Check if the title has a CTA keyword
		for (const keyword of ctaKeywords) {
			if (title.toLowerCase().includes(keyword)) {
				suggestions.push({
					text: $LL.WIDGET_Seo_Suggestion_ctaKeywordsTitle(),
					// TODO: Add Variable ${keyword to translation
					// text: `Your title has the CTA keyword "${keyword}". Good!`,
					impact: 3
				});
				scores.title_CTA_score = 3;
				break;
			}
		}

		// Check if the meta description has a CTA keyword
		for (const keyword of ctaKeywords) {
			if (description.toLowerCase().includes(keyword)) {
				suggestions.push({
					text: $LL.WIDGET_Seo_Suggestion_ctaKeywordsDescription(),
					// TODO: Add Variable ${keyword to translation
					// text: `Your description uses the CTA keyword "${keyword}". Good!`,
					impact: 3
				});
				scores.description_CTA_score = 3;

				break;
			}
		}
		score = Object.values(scores).reduce((acc, x) => acc + x);

		// Debug code to log the scores for each check
		// console.log('Title score:', scores.title_score);
		// console.log('Title numbers score:', scores.title_numbers_score);
		// console.log('Title power words score:', scores.title_power_words_score);
		// console.log('Title CTA score:', scores.title_CTA_score);

		// console.log('Description score:', scores.description_score);
		// console.log('Sentences score:', scores.sentences_score);
		// console.log('Description power words score:', scores.description_power_words_score);
		// console.log('Description CTA score:', scores.description_CTA_score);

		// console.log('Total score:', score);

		return suggestions;
	}
</script>

<!-- TODO: Fix input Value -->
<div class="input-container">
	<!-- TODO: Enhance color change of numbers only -->

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
			<div class="text-black dark:text-white">{$LL.WIDGET_Seo_Suggestion_Title()}</div>
			<div class="flex flex-col text-xs sm:flex-row sm:text-base">
				<div>
					{$LL.WIDGET_Seo_Suggestion_Character()}
					<span class="text-primary-500">{title.length}</span>
				</div>
				<div>
					{$LL.WIDGET_Seo_Suggestion_WidthDesktop()}
					<span class="text-primary-500">{titleCharacterWidth}</span>/600px {$LL.WIDGET_Seo_Suggestion_WidthMobile()}
					<span class="text-primary-500">{titleCharacterWidth}</span>/654px
				</div>
			</div>
		</div></label
	>
	<!-- TODO:specify Title data save -->
	<input
		id="title-input"
		type="text"
		class="input"
		placeholder={$LL.WIDGET_Seo_Suggestion_SeoTitle()}
		required
		bind:value={_data[_language].title}
		on:input={handleTitleChange}
	/>
</div>

<div class="input-container mt-2">
	<!-- svelte-ignore a11y-label-has-associated-control -->
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
			<div class="text-black dark:text-white">{$LL.WIDGET_Seo_Suggestion_Description()}</div>
			<div class="flex flex-col text-xs sm:flex-row sm:text-base">
				<div>
					{$LL.WIDGET_Seo_Suggestion_Character()}
					<span class="text-primary-500">{description.length}</span>
				</div>
				<div>
					{$LL.WIDGET_Seo_Suggestion_WidthDesktop()}
					<span class="text-primary-500">{descriptionCharacterWidth}</span>/970px

					{$LL.WIDGET_Seo_Suggestion_WidthMobile()}
					<span class="text-primary-500">{descriptionCharacterWidth}</span>/981px
				</div>
			</div>
		</div>
	</label>
	<!-- TODO:specify Description data save -->
	<textarea
		id="description-input"
		name="description-input"
		placeholder={$LL.WIDGET_Seo_Suggestion_SeoDescription()}
		rows="2"
		cols="50"
		bind:value={_data[_language].description}
		on:input={handleDescriptionChange}
		class="input"
	/>
</div>

<!-- CTR display -->
<div
	class="dark:boder-white relative mt-2 border-t border-surface-500 dark:border-white dark:bg-transparent"
>
	<h2 class="mt-1 text-right text-xl text-white sm:text-center sm:text-2xl">
		{$LL.WIDGET_Seo_Suggestion_SeoPreview()}
	</h2>

	<!-- Toggle Desktop/Mobile buttons -->
	<div class="absolute left-0 top-1 flex justify-between gap-2">
		<button
			on:click={() => (SeoPreviewToggle = !SeoPreviewToggle)}
			class="{SeoPreviewToggle
				? 'hidden'
				: 'block'} variant-filled-tertiary btn btn-sm flex items-center justify-center"
		>
			<iconify-icon icon="ion:desktop-outline" width="20" class="mr-1" />
			Desktop
		</button>

		<button
			on:click={() => (SeoPreviewToggle = !SeoPreviewToggle)}
			class="{SeoPreviewToggle
				? 'block'
				: 'hidden'} variant-filled-tertiary btn flex items-center justify-center"
		>
			<iconify-icon icon="bi:phone" width="18" class="mr-1" />
			Mobile
		</button>
	</div>

	{#if SeoPreviewToggle}
		<!-- mobile preview -->
		<!-- TODO: add mobile login display -->
		<div class="min-h-30 card variant-glass-secondary mx-auto mt-4 max-w-sm p-1 sm:p-2 md:p-4">
			<p class="flex items-center !text-xs text-surface-400">
				<iconify-icon icon="mdi:world" width="18" class="mr-2 text-white" />{hostUrl}
			</p>
			<p class="text-sm !font-medium text-primary-500 sm:px-4">{title}</p>
			<p class=" mb-2 !text-sm text-black dark:text-white sm:px-4">{description}</p>
		</div>
	{:else}
		<!-- desktop preview-->
		<div class="card variant-glass-secondary mt-4 p-1 sm:p-2 md:p-4">
			<p class="flex items-center !text-xs text-surface-400 sm:px-4">
				<iconify-icon icon="mdi:world" width="18" class="mr-2 text-white" />{hostUrl}
			</p>
			<p class="!font-medium text-primary-500 sm:px-4">{title}</p>
			<p class=" mb-2 pb-4 text-lg text-black dark:text-white sm:px-4">{description}</p>
		</div>
	{/if}
</div>

<!-- Mobile -->
<div class="md:hidden">
	<h3 class="mb-2 text-center">{$LL.WIDGET_Seo_Suggestion_ListOfSuggestion()}</h3>
	<div class="flex items-center justify-around">
		<ProgressRadial
			value={progress}
			stroke={200}
			meter="stroke-primary-500"
			width="w-20 sm:w-28"
			class="mr-6 mt-1 text-white ">{progress}%</ProgressRadial
		>
		<div class="flex flex-col items-center justify-start text-xs sm:text-sm">
			<div class="gap sm:flex sm:gap-4">
				<div class="flex justify-center gap-2">
					<iconify-icon icon="mdi:close-octagon" class="text-error-500" width="20" />
					<span class="flex-auto">0 - 49</span>
				</div>
				<div class="flex justify-center gap-2">
					<span
						><iconify-icon
							icon="bi:hand-thumbs-up-fill"
							width="20"
							class="text-tertiary-500"
						/></span
					>
					<span class="flex-auto">50 - 79</span>
				</div>
				<div class="flex justify-center gap-2">
					<span
						><iconify-icon
							icon="material-symbols:check-circle-outline"
							class="text-success-500"
							width="20"
						/></span
					>
					<span class="flex-auto">80 - 100</span>
				</div>
			</div>
			<p class="mt-1 hidden text-justify !text-sm sm:block">
				{$LL.WIDGET_Seo_Suggestion_Text()}
			</p>
		</div>
	</div>
</div>

<!-- desktop -->
<div class="hidden md:block">
	<div class="mt-2 flex items-center justify-center dark:text-white">
		<ProgressRadial
			value={progress}
			stroke={200}
			meter="stroke-primary-500"
			class="mr-6 mt-1 w-20 text-2xl text-white">{progress}%</ProgressRadial
		>
		<div class="mb-2">
			<div class="mb-2 flex items-center justify-between lg:justify-start lg:gap-5">
				<h3 class="">{$LL.WIDGET_Seo_Suggestion_ListOfSuggestion()}</h3>

				<div class="flex items-center gap-2">
					<iconify-icon icon="mdi:close-octagon" class="text-error-500" width="24" />
					<span class="flex-auto">0 - 49</span>
				</div>
				<div class="flex items-center gap-2">
					<span
						><iconify-icon
							icon="bi:hand-thumbs-up-fill"
							width="24"
							class="text-tertiary-500"
						/></span
					>
					<span class="flex-auto">50 - 79</span>
				</div>
				<div class="flex items-center gap-2">
					<span
						><iconify-icon
							icon="material-symbols:check-circle-outline"
							class="text-success-500"
							width="24"
						/></span
					>
					<span class="flex-auto">80 - 100</span>
				</div>
			</div>
			<p>
				{$LL.WIDGET_Seo_Suggestion_Text()}
			</p>
		</div>
	</div>
</div>
<hr class="mt-1" />
<ul class="mt-1 grid md:grid-cols-2">
	{#each suggestions as suggestion}
		<li class="flex items-start p-1">
			<div class="mr-4 flex-none">
				{#if suggestion.impact === 3}
					<iconify-icon
						icon="material-symbols:check-circle-outline"
						class="text-success-500"
						width="24"
					/>
				{:else if suggestion.impact === 2}
					<iconify-icon icon="bi:hand-thumbs-up-fill" width="24" class="text-tertiary-500" />
				{:else}
					<iconify-icon icon="mdi:close-octagon" class="text-error-500" width="24" />
				{/if}
			</div>
			<span class="flex-auto text-sm">{suggestion.text}</span>
		</li>
	{/each}
</ul>

<style lang="postcss">
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
</style>
