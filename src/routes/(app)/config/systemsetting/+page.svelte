<script lang="ts">
	import { goto } from '$app/navigation';
	import PageTitle from '@components/PageTitle.svelte';
</script>

<div class="my-2 flex items-center justify-between">
	<PageTitle name="System Settings" icon="uil:setting" />
</div>

<div class="mt-4">
	<div class="wrapper text-center">
		<p>Welcome to the System Configuration page.</p>
		<p>Here, you can manage various settings for your SveltyCMS application, including database, email, language, and other system configurations.</p>
		<p>Please select a configuration category to proceed.</p>
	</div>
</div>

<div class="my-2 mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
	<!-- Database Settings -->
	<button on:click={() => goto('/(app)/config/systemsetting/database')} class="variant-outline-primary btn gap-2">
		<iconify-icon icon="mdi:database" width="28" class="text-white" />
		Database Settings
	</button>
	<!-- Email Settings -->
	<button on:click={() => goto('/(app)/config/systemsetting/Email.svelte')} class="variant-outline-primary btn gap-2">
		<iconify-icon icon="mdi:email" width="28" class="text-white" />
		Email Settings
	</button>
	<!-- Language Settings -->
	<button on:click={() => goto('/(app)/config/systemsetting/language')} class="variant-outline-primary btn gap-2">
		<iconify-icon icon="mdi:translate" width="28" class="text-white" />
		Language Settings
	</button>
	<!-- System Settings -->
	<button on:click={() => goto('/(app)/config/systemsetting/system')} class="variant-outline-primary btn gap-2">
		<iconify-icon icon="mdi:cog" width="28" class="text-white" />
		System Settings
	</button>
	<!-- Media Settings -->
	<button on:click={() => goto('/(app)/config/systemsetting/media')} class="variant-outline-primary btn gap-2">
		<iconify-icon icon="mdi:image" width="28" class="text-white" />
		Media Settings
	</button>
	<!-- Google Settings -->
	<button on:click={() => goto('/(app)/config/systemsetting/google')} class="variant-outline-primary btn gap-2">
		<iconify-icon icon="mdi:google" width="28" class="text-white" />
		Google Settings
	</button>
	<!-- Redis Settings -->
	<button on:click={() => goto('/(app)/config/systemsetting/redis')} class="variant-outline-primary btn gap-2">
		<iconify-icon icon="mdi:server" width="28" class="text-white" />
		Redis Settings
	</button>
	<!-- Mapbox Settings -->
	<button on:click={() => goto('/(app)/config/systemsetting/mapbox')} class="variant-outline-primary btn gap-2">
		<iconify-icon icon="mdi:map-marker" width="28" class="text-white" />
		Mapbox Settings
	</button>
	<!-- Tiktok Settings -->
	<button on:click={() => goto('/(app)/config/systemsetting/tiktok')} class="variant-outline-primary btn gap-2">
		<iconify-icon icon="ic:baseline-tiktok" width="28" class="text-white" />
		Tiktok Settings
	</button>
	<!-- OpenAI Settings -->
	<button on:click={() => goto('/(app)/config/systemsetting/openai')} class="variant-outline-primary btn gap-2">
		<iconify-icon icon="mdi:robot" width="28" class="text-white" />
		OpenAI Settings
	</button>
</div>
