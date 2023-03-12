<script lang="ts">
	import { language } from '$src/stores/store';
	import { PUBLIC_LANGUAGE } from '$env/static/public';

	// get current page url
	import { onMount } from 'svelte';

	let hostUrl: any;

	onMount(() => {
		hostUrl = window.location.origin;
	});

	// skeleton
	import { ProgressRadial } from '@skeletonlabs/skeleton';

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';

	export let field: any = undefined;
	export let value = '';

	export let widgetValue;
	$: widgetValue = value;
	$: _language = field.localization ? $language : PUBLIC_LANGUAGE;

	let title = '';
	let titleCharacterWidth = 0;
	let description = '';
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

	// Display correct Radialdial score based on 3 points per function
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
				text: $LL.WIDGET_Seo_Suggetion_TitlePerfect(),
				impact: 3
			});
			scores.title_score = 3;
		}
		// Check if the title is more than 30 characters
		else if (title.length > 30) {
			suggestions.push({
				text: $LL.WIDGET_Seo_Suggetion_TitleGood(),
				impact: 2
			});

			scores.title_score = 2;
		}
		// Otherwise, the title is less than 30 characters
		else if (title.length > 0) {
			suggestions.push({
				text: $LL.WIDGET_Seo_Suggetion_TitleBad(),
				impact: 1
			});
			scores.title_score = 1;
		}

		// Check if the description is between 120 and 165 characters
		if (description.length >= 120 && description.length <= 165) {
			suggestions.push({
				text: $LL.WIDGET_Seo_Suggetion_DescriptionPerfect(),
				impact: 3
			});
			scores.description_score = 3;
		}
		// Check if the description is more than 90 characters
		else if (description.length > 90) {
			suggestions.push({
				text: $LL.WIDGET_Seo_Suggetion_DescriptionGood(),
				impact: 2
			});

			scores.description_score = 2;
		}
		// Otherwise, the description is less than 90 characters
		else if (description.length > 0) {
			suggestions.push({
				text: $LL.WIDGET_Seo_Suggetion_DescriptionBad(),
				impact: 1
			});
			scores.description_score = 1;
		}

		// Check if the meta description is 2 to 4 sentences long
		const sentences = description.split('.').filter((x) => x.length > 1);
		if (sentences.length >= 2 && sentences.length <= 4) {
			suggestions.push({
				text: $LL.WIDGET_Seo_Suggetion_SentencePerfect(),
				impact: 3
			});
			scores.sentences_score = 3;
		} else if (sentences.length > 0) {
			suggestions.push({
				text: $LL.WIDGET_Seo_Suggetion_SentenceBad(),
				impact: 1
			});
			scores.sentences_score = 0;
		}

		// Check if the title uses numbers
		if (title.length > 0 && /\d/.test(title)) {
			suggestions.push({
				text: $LL.WIDGET_Seo_Suggetion_NumberPerfect(),
				impact: 3
			});
			scores.title_numbers_score = 3;
		} else if (title.length > 0) {
			suggestions.push({
				text: $LL.WIDGET_Seo_Suggetion_NumberBad(),
				impact: 1
			});
			scores.title_numbers_score = 0;
		}

		// Check if the title has a power word
		// TODO: Translation still required
		const powerWords = [
			'amazing',
			'attractive',
			'become',
			'best',
			'boost',
			'breaking',
			'breaking news',
			'cheap',
			'discover',
			'direct',
			'easy',
			'exclusive',
			'fresh',
			'full',
			'free',
			'free trial',
			'gain',
			'get',
			'grow',
			'hurry',
			'happiness',
			'health',
			'hot',
			'improve',
			'improvement',
			'innovative',
			'instant',
			'join',
			'latest',
			'limited',
			'limited time',
			'love',
			'new',
			'newsworthy',
			'powerful',
			'popular',
			'proven',
			'quality',
			'quick',
			'revolutionary',
			'save',
			'sale',
			'safety',
			'sign up',
			'special',
			'special offer',
			'solutions',
			'success',
			'support',
			'today',
			'trending',
			'trust',
			'urgent',
			'viral',
			'when',
			'winner',
			'worldwide',
			'wealth'
		];

		for (const word of powerWords) {
			if (title.toLowerCase().includes(word)) {
				suggestions.push({
					text: $LL.WIDGET_Seo_Suggetion_PowerWordTitle(),
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
					text: $LL.WIDGET_Seo_Suggetion_PowerWordDescription(),
					// TODO: Add Variable   ${word} to translation
					// text: `Your description uses the Power Word ${word}. Perfect!`,
					impact: 3
				});
				scores.description_power_words_score = 3;

				break;
			}
		}

		// Define the list of CTA keywords
		// TODO: Translation still required
		const ctaKeywords = [
			'buy',
			'click here',
			'download now',
			'learn more',
			'sign up',
			'buy now',
			'shop now',
			'order now',
			'get started',
			'start your free trial',
			'request a quote',
			'join now',
			'find a location',
			'get your quote',
			'get your free guide',
			'see our plans'
		];

		// Check if the title has a CTA keyword
		for (const keyword of ctaKeywords) {
			if (title.toLowerCase().includes(keyword)) {
				suggestions.push({
					text: $LL.WIDGET_Seo_Suggetion_ctaKeywordsTitle(),
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
					text: $LL.WIDGET_Seo_Suggetion_ctaKeywordsDescription(),
					// TODO: Add Variable ${keyword to translation
					// text: `Your description uses the CTA keyword "${keyword}". Good!`,
					impact: 3
				});
				scores.description_CTA_score = 3;

				break;
			}
		}
		score = Object.values(scores).reduce((acc, x) => acc + x);
		return suggestions;
	}
</script>

<div class="input-container rounded">
	<!-- TODO: Enhance color change of numbers only -->
	<!-- svelte-ignore a11y-label-has-associated-control -->
	<label
		class={title.length >= 50 && title.length <= 60
			? 'input-label green'
			: title.length >= 30 && title.length <= 49
			? 'input-label orange'
			: title.length < 30
			? 'input-label'
			: 'input-label red'}
	>
		<div class="flex justify-between">
			<div class="text-black dark:text-white">{$LL.WIDGET_Seo_Suggetion_Title()}</div>
			<div>
				{$LL.WIDGET_Seo_Suggetion_Character()}
				{title.length}
				{$LL.WIDGET_Seo_Suggetion_WidthDesktop()}
				{titleCharacterWidth}/600px {$LL.WIDGET_Seo_Suggetion_WidthMobile()}
				{titleCharacterWidth}/654px
			</div>
		</div>
	</label>
	<input
		id="title-input"
		type="text"
		class="input rounded-md"
		placeholder={$LL.WIDGET_Seo_Suggetion_SeoTitle()}
		required
		bind:value={title}
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
			<div class="text-black dark:text-white">{$LL.WIDGET_Seo_Suggetion_Description()}</div>
			<div>
				{$LL.WIDGET_Seo_Suggetion_Character()}
				{description.length}
				{$LL.WIDGET_Seo_Suggetion_WidthDesktop()}
				{descriptionCharacterWidth}/970px {$LL.WIDGET_Seo_Suggetion_WidthMobile()}
				{descriptionCharacterWidth}/981px
			</div>
		</div>
	</label>
	<textarea
		id="description-input"
		name="description-input"
		placeholder={$LL.WIDGET_Seo_Suggetion_SeoDescription()}
		rows="2"
		cols="50"
		bind:value={description}
		on:input={handleDescriptionChange}
		class="input rounded-md"
	/>
</div>
<!-- CTR display -->
<div
	class="relative dark:boder-white mt-2 border-t border-surface-500 dark:border-white dark:bg-transparent"
>
	<h2 class="text-center mt-2">
		<span class="bg-surface-500 dark:bg-white rounded text-2xl text-white dark:text-black p-1"
			>{$LL.WIDGET_Seo_Suggetion_SeoPreview()}</span
		>
	</h2>

	<!-- Toggle Desktop/Mobile buttons -->
	<div class="absolute top-1 left-0 flex justify-between gap-2">
		<button
			on:click={() => (SeoPreviewToggle = !SeoPreviewToggle)}
			class="{SeoPreviewToggle
				? 'hidden'
				: 'block'} btn variant-filled-tertiary flex items-center justify-center"
		>
			<Icon icon="ion:desktop-outline" width="20" class="mr-1" />
			Desktop
		</button>

		<button
			on:click={() => (SeoPreviewToggle = !SeoPreviewToggle)}
			class="{SeoPreviewToggle
				? 'block'
				: 'hidden'} btn variant-filled-tertiary flex items-center justify-center"
		>
			<Icon icon="bi:phone" width="20" class="mr-1" />
			Mobile
		</button>
	</div>

	{#if SeoPreviewToggle}
		<!-- mobile preview -->
		<!-- TODO: add mobile login display -->
		<div class="card variant-glass-secondary h-28 mt-4 p-4 max-w-sm mx-auto">
			<p class="!text-xs px-4 text-surface-400 flex items-center ">
				<Icon icon="mdi:world" width="18" class="text-white mr-2" />{hostUrl}
			</p>
			<h3 class="px-4 !font-medium text-primary-500">{title}</h3>
			<p class=" mb-2 px-4 pb-4 text-lg text-black dark:text-white">{description}</p>
		</div>
	{:else}
		<!-- desktop preview-->
		<div class="card variant-glass-secondary h-28 mt-4 p-4">
			<p class="!text-xs px-4 text-surface-400">{hostUrl}</p>
			<h3 class="px-4 !font-medium text-primary-500">{title}</h3>
			<p class=" mb-2 px-4 pb-4 text-lg text-black dark:text-white">{description}</p>
		</div>
	{/if}
</div>

<!-- Mobile -->
<div class="md:hidden">
	<h3 class="mb-2 text-center ">{$LL.WIDGET_Seo_Suggetion_ListOfSuggestion()}</h3>
	<div class="flex">
		<ProgressRadial
			value={progress}
			stroke={200}
			meter="stroke-primary-500"
			class="mt-1 mr-6 w-20  text-white sm:w-28">{progress}%</ProgressRadial
		>
		<div class="flex flex-col justify-start">
			<div class="gap sm:flex sm:gap-4">
				<div class="flex justify-center gap-2 ">
					<Icon icon="mdi:close-octagon" class="text-error-500" width="24" />
					<span class="flex-auto">0 - 49</span>
				</div>
				<div class="flex justify-center gap-2">
					<span><Icon icon="bi:hand-thumbs-up-fill" width="24" class="text-tertiary-500" /></span>
					<span class="flex-auto">50 - 79</span>
				</div>
				<div class="flex justify-center gap-2 ">
					<span
						><Icon
							icon="material-symbols:check-circle-outline"
							class="text-success-500"
							width="24"
						/></span
					>
					<span class="flex-auto">80 - 100</span>
				</div>
			</div>
			<p class="mt-1 hidden text-justify !text-sm sm:block">
				{$LL.WIDGET_Seo_Suggetion_Text()}
			</p>
		</div>
	</div>
</div>

<!-- desktop -->
<div class="hidden md:block">
	<div class="mt-2 flex items-center justify-center dark:text-white ">
		<ProgressRadial
			value={progress}
			stroke={200}
			meter="stroke-primary-500"
			class="mt-1 mr-6 w-20 text-2xl text-white">{progress}%</ProgressRadial
		>
		<div class="mb-2">
			<div class="mb-2 flex items-center justify-between lg:justify-start lg:gap-5">
				<h3 class="">{$LL.WIDGET_Seo_Suggetion_ListOfSuggestion()}</h3>

				<div class="flex items-center gap-2">
					<Icon icon="mdi:close-octagon" class="text-error-500" width="24" />
					<span class="flex-auto">0 - 49</span>
				</div>
				<div class="flex items-center gap-2">
					<span><Icon icon="bi:hand-thumbs-up-fill" width="24" class="text-tertiary-500" /></span>
					<span class="flex-auto">50 - 79</span>
				</div>
				<div class="flex items-center gap-2">
					<span
						><Icon
							icon="material-symbols:check-circle-outline"
							class="text-success-500"
							width="24"
						/></span
					>
					<span class="flex-auto">80 - 100</span>
				</div>
			</div>
			<p>
				{$LL.WIDGET_Seo_Suggetion_Text()}
			</p>
		</div>
	</div>
</div>
<hr class="mt-1" />
<ul class="grid md:grid-cols-2 mt-1">
	{#each suggestions as suggestion}
		<li class="flex items-start p-1">
			<div class="mr-4 flex-none">
				{#if suggestion.impact === 3}
					<Icon icon="material-symbols:check-circle-outline" class="text-success-500" width="24" />
				{:else if suggestion.impact === 2}
					<Icon icon="bi:hand-thumbs-up-fill" width="24" class="text-tertiary-500" />
				{:else}
					<Icon icon="mdi:close-octagon" class="text-error-500" width="24" />
				{/if}
			</div>
			<span class="flex-auto text-sm">{suggestion.text}</span>
		</li>
	{/each}
</ul>

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
</style>
