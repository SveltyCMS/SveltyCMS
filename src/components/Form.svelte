<script lang="ts">
	import { entryData, getFieldsData, language } from '$src/stores/store';
	import { PUBLIC_TRANSLATIONS } from '$env/static/public';

	import type { Schema } from '$src/collections/types';
	import Fields from './Fields.svelte';

	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';

	// Skeleton
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';

	// Popup Tooltips
	let CloseMenuSettings: PopupSettings = {
		event: 'hover',
		target: 'CloseMenuPopup',
		placement: 'bottom'
	};

	let ContentLangSettings: PopupSettings = {
		// Set the event as: click | hover | hover-click
		event: 'click',
		// Provide a matching 'data-popup' value.
		target: 'ContentLang'
	};

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	export let fields: Array<any> = [];
	export let collection: Schema | undefined = undefined;
	export let showFields = true;
	import showFieldsStore from '$src/lib/stores/fieldStore';

	$: {
		$getFieldsData = new Set();
		collection;
	}

	let open = false;
</script>

<div
	class="fields text-dark overflow-y-auto rounded bg-white p-3 dark:bg-surface-800 dark:text-white"
>
	<div class="relative mb-5 flex justify-start overflow-visible font-bold ">
		<div class="flex w-full flex-col">
			<div class="mb-2 text-sm capitalize text-surface-400 dark:text-surface-300">
				{$LL.FORM_Create()}
			</div>
			<div
				class="-mt-2 flex items-center justify-start text-sm font-bold uppercase dark:text-white md:text-xl xl:text-2xl "
			>
				<span> <Icon icon={collection?.icon} width="24" class="mr-2" /></span>{collection?.name}
			</div>
		</div>

		<span class="absolute right-14">
			<button
				use:popup={ContentLangSettings}
				class="btn btn-sm variant-filled-surface flex items-center justify-center rounded-lg uppercase text-white"
			>
				<Icon icon="bi:translate" color="dark" width="22" class="mr-1 md:mr-1" />
				{$language}
				<Icon icon="mdi:chevron-down" width="24" />
			</button>
			<nav
				class="card list-nav w-[95px] border bg-surface-600 p-2 text-center text-white shadow-xl transition duration-150 ease-in-out hover:bg-surface-500 focus:bg-surface-700 focus:outline-none focus:ring-0 active:bg-surface-600 dark:bg-surface-400 dark:text-black"
				data-popup="ContentLang"
			>
				<ul class="divide-y">
					{#each Object.keys(JSON.parse(PUBLIC_TRANSLATIONS)).filter((data) => $language != data) as _language}
						<!-- svelte-ignore a11y-click-events-have-key-events -->
						<li
							on:click={() => {
								$language = _language;
								open = false;
							}}
						>
							{_language.toUpperCase()}
						</li>
					{/each}
				</ul>
			</nav>
		</span>
		<button
			use:popup={CloseMenuSettings}
			on:click={() => {
				$showFieldsStore.showForm = false;
				$entryData = new Set();
			}}
			class="btn absolute right-0 hidden dark:text-white md:block"
		>
			<!-- Popup Tooltip with the arrow element -->
			<div class="card variant-filled-secondary p-4" data-popup="CloseMenuPopup">
				{$LL.FORM_CloseMenu()}
				<div class="arrow variant-filled-secondary" />
			</div>

			<span class="sr-only">{$LL.FORM_CloseMenu()}</span>
			<Icon icon="material-symbols:close" width="26" />
		</button>
	</div>

	{#if fields.some((field) => field.field.required)}
		<div class="text-md -mt-3 text-center text-error-500">* {$LL.FORM_Required()}</div>
	{/if}
	<Fields {collection} {fields} />
</div>

<style>
	:global(.fields .title) {
		color: white;
	}
	.fields {
		max-height: calc(100vh - 50px);
	}
</style>
