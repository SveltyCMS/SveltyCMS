<script lang="ts">
	// Component
	import PageTitle from '@components/PageTitle.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
</script>

<div class="my-2 flex items-center justify-between">
	<PageTitle name={m.config_pagetitle()} icon="" />
</div>

<div class="wrapper mb-2 max-h-[calc(100vh-65px)] overflow-auto">
	<h2 class="mb-4 text-center text-tertiary-600 dark:text-primary-500">{m.config_body()}</h2>
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
		<!-- Collection -->
		<a href="/collection" class="variant-outline-tertiary btn w-full gap-2 overflow-hidden py-6 dark:variant-outline-secondary">
			<iconify-icon icon="fluent-mdl2:build-definition" width="24" class="text-tertiary-600" />
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
			<p class="uppercase">{m.config_Dashboard()}</p>
		</a>

		<!-- Market Place -->
		<a href="https://www.sveltyCMS.com" class="variant-ghost-primary btn w-full gap-2 py-6">
			<iconify-icon icon="icon-park-outline:shopping-bag" width="28" class="text-white" />
			<p class="uppercase">{m.config_Martketplace()}</p>
		</a>
	</div>
</div>
