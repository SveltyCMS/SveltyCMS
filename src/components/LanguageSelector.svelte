<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import { getFieldName } from '@src/utils/utils';

	//Store
	import { contentLanguage, collection } from '@src/stores/store';
	import { collectionValue, mode } from '@src/stores/store';

	let languages = publicEnv.AVAILABLE_CONTENT_LANGUAGES;
	$contentLanguage = languages[0];

	export let label: string = '';

	let expanded = false;

	$: console.log(translations);

	$: {
		checkTranslations();
		$collectionValue;
	}

	let translations = {};

	async function checkTranslations() {
		translations = {};
		for (let key in $collectionValue) {
			let data = await $collectionValue[key]();
			for (let lang of languages) {
				let field = $collection.fields.find((x) => getFieldName(x) == key);
				if (!field || ('translated' in field && !field.translated)) continue;
				if (!translations[lang]) translations[lang] = { total: 0, translated: 0 };
				if (!data[lang]) {
					translations[lang].total++;
				} else {
					translations[lang].translated++;
					translations[lang].total++;
				}
			}
		}
	}
</script>

<div class="container bg-surface-500">
	<button on:click={() => (expanded = !expanded)} class="flex cursor-pointer items-center justify-evenly" class:selected={expanded}>
		<iconify-icon icon="clarity:language-solid" width="24" />

		<p>{($contentLanguage || label).toUpperCase()}</p>
	</button>
	{#if expanded}
		<div class="items bg-surface-500" class:itemsView={$mode == 'view'}>
			{#each languages as item}
				{#if $mode != 'view'}
					<div
						class="item flex items-center py-2"
						on:click={() => {
							$contentLanguage = item;
							expanded = false;
						}}
					>
						<p>
							{item.toUpperCase()}
						</p>
						<div class="h-[5px] w-[100px] bg-white">
							<div
								style="width:{(translations[item]?.translated * 100) / translations[item]?.total}%"
								class="h-[5px] bg-primary-500 transition-all"
							></div>
						</div>
						<p>{((translations[item]?.translated ?? 1) * 100) / translations[item]?.total ?? 100}%</p>
					</div>
				{:else}
					<p
						class="item"
						on:click={() => {
							$contentLanguage = item;
							expanded = false;
						}}
					>
						{item.toUpperCase()}
					</p>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	.container {
		border-radius: 5px;
	}
	.selected {
		border-bottom: 1px solid white;
	}
	p {
		position: relative;

		padding: 5px 10px;
		color: white;
		text-align: center;
		user-select: none;
	}
	.items {
		margin-top: 10px;
		position: absolute;
		width: 200px;
		right: 0;
		top: 100%;
	}
	.itemsView {
		width: 100%;
		margin-top: 0;
		position: relative;
	}
	.item:hover {
		background-color: aqua;
	}
	.item {
		cursor: pointer;
		width: 100%;
		border-bottom: 1px solid rgb(153, 153, 153);
	}
</style>
