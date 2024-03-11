<script lang="ts">
	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	import PageTitle from '@components/PageTitle.svelte';

	import { onMount } from 'svelte';

	// Stores
	import { globalSearchIndex } from '@utils/globalSearchIndex';

	// Define the page data
	// const globalSearchData = {
	// 	title: 'Configuration',
	// 	description: 'Configure the system settings.',
	// 	keywords: ['configuration', 'settings', 'system'],
	// 	triggers: { 'Go to Configuration': { path: '/config/', action: () => {} } }
	// };

	// // Function to check if a page entry already exists in the global search index
	// const isPageEntryExists = (index: any, pageData: any) => {
	// 	return index.some((item: any) => {
	// 		return item.title === pageData.title; // Assuming title uniquely identifies a page
	// 	});
	// };

	// // Mount hook to add the configuration page data to the global search index
	// onMount(() => {
	// 	// Get the current value of the global search index
	// 	const currentIndex = $globalSearchIndex;

	// 	// Check if the configuration page data already exists in the index
	// 	const isDataExists = isPageEntryExists(currentIndex, globalSearchData);

	// 	// If the data doesn't exist, add it to the global search index
	// 	if (!isDataExists) {
	// 		globalSearchIndex.update((index) => [...index, globalSearchData]);
	// 	}
	// });
</script>

<div class="mb-2 flex items-center">
	<PageTitle name={m.config_pagetitle()} icon="" />
</div>
<div class="wrapper">
	<h2 class="mb-4 text-center text-tertiary-600 dark:text-primary-500">{m.config_body()}</h2>
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
		<!-- Collection -->
		<a href="/collection" class="variant-outline-tertiary btn w-full gap-2 overflow-hidden py-6 dark:variant-outline-secondary">
			<iconify-icon icon="mingcute:menu-fill" width="24" class="text-tertiary-600" />
			<p class="overflow-hidden overflow-ellipsis uppercase">
				{m.config_systembuilder()}
			</p>
		</a>

		<!-- Graphql Api -->
		<a href="/api/graphql" rel="external" class="variant-outline-tertiary btn w-full gap-2 py-6 dark:variant-outline-secondary">
			<iconify-icon icon="teenyicons:graphql-solid" width="24" class="text-warning-600" />
			<p class="uppercase">
				{m.config_graphql()}
			</p>
		</a>

		<!-- Editor -->
		<a href="/imageEditor" class="variant-outline-tertiary btn w-full gap-2 py-6 dark:variant-outline-secondary">
			<iconify-icon icon="bi:images" width="24" class="text-primary-600" />
			<p class="uppercase">
				{m.config_imageeditor()}
			</p>
		</a>

		<!-- Dashboard -->
		<a href="/dashboard" class="variant-outline-tertiary btn w-full gap-2 py-6 dark:variant-outline-secondary">
			<iconify-icon icon="bi:images" width="24" class="text-error-600" />
			<p class="uppercase">Dashboard</p>
		</a>
	</div>
</div>
