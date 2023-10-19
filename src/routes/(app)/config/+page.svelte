<script lang="ts">
	import PageTitle from '@src/components/PageTitle.svelte';

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';
</script>

<div class="mb-2 flex items-center">
	<PageTitle name={$LL.CONFIG_Pagetitle()} icon="" />
</div>

<h2 class="ml-2 mt-8 text-center text-tertiary-600 dark:text-primary-500">{$LL.CONFIG_Body()}</h2>
<div class="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
	<!-- Collection -->
	<a href="/collection" class="variant-outline-tertiary dark:variant-outline-secondary btn gap-2 py-6">
		<iconify-icon icon="mingcute:menu-fill" width="24" class="text-tertiary-600" />
		<p class="uppercase">{$LL.CONFIG_SystemBuilder()}</p>
	</a>

	<!-- builder to be replaced -->
	<a href="/builder" class="variant-outline-tertiary dark:variant-outline-secondary btn gap-2 py-6">
		<iconify-icon icon="fluent-mdl2:build-definition" width="24" class="text-error-600" />
		<p class="uppercase">Collection Builder</p>
	</a>

	<!-- Graphql Api -->
	<a href="/api/graphql" rel="external" class="variant-outline-tertiary dark:variant-outline-secondary btn gap-2 py-6">
		<iconify-icon icon="teenyicons:graphql-solid" width="24" class="text-error-600" />
		<p class="uppercase">Graphql api</p>
	</a>

	<!-- Editor -->
	<a href="/imageEditor" class="variant-outline-tertiary dark:variant-outline-secondary btn gap-2 py-6">
		<iconify-icon icon="bi:images" width="24" class="text-error-600" />
		<p class="uppercase">Image Editor</p>
	</a>
</div>
