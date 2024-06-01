<script lang="ts">
	import { goto } from '$app/navigation';
	import PageTitle from '@components/PageTitle.svelte';

	import ModalEditSystem from './ModalEditSystem.svelte';
	import { getToastStore, getModalStore } from '@skeletonlabs/skeleton';
	import type { ModalComponent, ModalSettings } from '@skeletonlabs/skeleton';

	import { privateEnv } from '@root/config/private';
	import { publicEnv } from '@root/config/public';
	import { privateConfigCategories, publicConfigCategories } from '@root/config/types';

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	function formatConfig(config, keys) {
		return keys.map((key) => `${key}: ${config[key]}`).join('\n');
	}

	function openModal(title, configData): void {
		const modalComponent: ModalComponent = {
			ref: ModalEditSystem,
			props: { title, configData, parent: { onClose: () => modalStore.close() } }
		};
		const modalSettings: ModalSettings = {
			type: 'component',
			title,
			component: modalComponent
		};
		modalStore.trigger(modalSettings);
	}
</script>

<div class="my-2 flex items-center justify-between">
	<PageTitle name="System Settings" icon="uil:setting" />
</div>

<div class="mt-4">
	<div class="wrapper !bg-error-500 text-center">
		<p>In Development only</p>
		<p>Environment Data is only shown to admin</p>
	</div>
</div>

<div class="my-2 mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
	<!-- Database Settings -->
	<button
		on:click={() => openModal('Database Settings', formatConfig(privateEnv, privateConfigCategories.database))}
		class="variant-outline-primary btn gap-2"
	>
		<iconify-icon icon="mdi:database" width="28" class="text-white" />
		Database Settings
	</button>
	<!-- Email Settings -->
	<button
		on:click={() => openModal('Email Settings', formatConfig(privateEnv, privateConfigCategories.email))}
		class="variant-outline-primary btn gap-2"
	>
		<iconify-icon icon="mdi:email" width="28" class="text-white" />
		Email Settings
	</button>
	<!-- Language Settings -->
	<button
		on:click={() => openModal('Language Settings', formatConfig(publicEnv.site, publicConfigCategories.site))}
		class="variant-outline-primary btn gap-2"
	>
		<iconify-icon icon="mdi:translate" width="28" class="text-white" />
		Language Settings
	</button>
	<!-- System Settings -->
	<button
		on:click={() => openModal('System Settings', formatConfig(publicEnv.site, publicConfigCategories.site))}
		class="variant-outline-primary btn gap-2"
	>
		<iconify-icon icon="mdi:cog" width="28" class="text-white" />
		System Settings
	</button>
	<!-- Media Settings -->
	<button
		on:click={() => openModal('Media Settings', formatConfig(publicEnv.site, publicConfigCategories.site))}
		class="variant-outline-primary btn gap-2"
	>
		<iconify-icon icon="mdi:image" width="28" class="text-white" />
		Media Settings
	</button>
	<!-- Google Settings -->
	<button
		on:click={() => openModal('Google Settings', formatConfig(privateEnv, privateConfigCategories.google))}
		class="variant-outline-primary btn gap-2"
	>
		<iconify-icon icon="mdi:google" width="28" class="text-white" />
		Google Settings
	</button>
	<!-- Redis Settings -->
	<button
		on:click={() => openModal('Redis Settings', formatConfig(privateEnv, privateConfigCategories.redis))}
		class="variant-outline-primary btn gap-2"
	>
		<iconify-icon icon="mdi:server" width="28" class="text-white" />
		Redis Settings
	</button>
	<!-- Mapbox Settings -->
	<button
		on:click={() => openModal('Mapbox Settings', formatConfig(privateEnv, privateConfigCategories.mapbox))}
		class="variant-outline-primary btn gap-2"
	>
		<iconify-icon icon="mdi:map-marker" width="28" class="text-white" />
		Mapbox Settings
	</button>
	<!-- Tiktok Settings -->
	<button
		on:click={() => openModal('Tiktok Settings', formatConfig(privateEnv, privateConfigCategories.tiktok))}
		class="variant-outline-primary btn gap-2"
	>
		<iconify-icon icon="ic:baseline-tiktok" width="28" class="text-white" />
		Tiktok Settings
	</button>
	<!-- OpenAI Settings -->
	<button
		on:click={() => openModal('OpenAI Settings', formatConfig(privateEnv, privateConfigCategories.openai))}
		class="variant-outline-primary btn gap-2"
	>
		<iconify-icon icon="mdi:robot" width="28" class="text-white" />
		OpenAI Settings
	</button>
</div>
