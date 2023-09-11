<script lang="ts">
	import PageTitle from '@src/components/PageTitle.svelte';
</script>

<div class="mb-2 flex items-center">
	<PageTitle name="System Configuration" icon="" />
</div>

<h2 class="ml-2 mt-8 text-center text-primary-500">Select what you need to customize</h2>
<div class="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
	<!-- Collection -->
	<a href="/collection" class="variant-outline-secondary btn gap-2 py-6">
		<iconify-icon icon="mingcute:menu-fill" width="24" class="text-tertiary-600" />
		<p class="uppercase">Sidebar Menu</p>
	</a>

	<!-- builder to be replaced -->
	<a href="/builder" class="variant-outline-secondary btn gap-2 py-6">
		<iconify-icon icon="fluent-mdl2:build-definition" width="24" class="text-tertiary-600" />
		<p class="uppercase">Collection Builder</p>
	</a>

	<!-- Graphql Api -->
	<a href="/api/graphql" class="variant-outline-secondary btn gap-2 py-6">
		<iconify-icon icon="teenyicons:graphql-solid" width="24" class="text-tertiary-600" />
		<p class="uppercase">Graphql api</p>
	</a>

	<!-- Editor -->
	<a href="/imageEditor" class="variant-outline-secondary btn gap-2 py-6">
		<iconify-icon icon="bi:images" width="24" class="text-error-600" />
		<p class="uppercase">Image Editor</p>
	</a>
</div>
