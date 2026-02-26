<!--
@file src/routes/(app)/config/collectionbuilder/nested-content/empty-state.svelte
@component
**Premium Empty State for Collection Builder**
-->

<script lang="ts">
	import { collection_add } from '@src/paraglide/messages';
	import { fade, scale } from 'svelte/transition';
	import { publicEnv } from '@src/stores/global-settings.svelte';

	interface Props {
		onAddCollection: () => void;
	}

	let { onAddCollection }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center p-8 py-16 text-center" in:fade={{ duration: 400 }}>
	<!-- Illustration Container -->
	<div
		class="relative mb-8 flex h-48 w-48 items-center justify-center rounded-full bg-linear-to-br from-primary-500/10 to-tertiary-500/10 dark:from-primary-500/5 dark:to-tertiary-500/5"
		in:scale={{ duration: 600, delay: 200, start: 0.8 }}
	>
		<!-- Background Glow -->
		<div class="absolute inset-0 animate-pulse rounded-full bg-primary-500/5 blur-3xl"></div>

		<!-- Blueprint/Folder Icon -->
		<div
			class="relative flex h-32 w-32 items-center justify-center rounded-3xl border border-white/20 bg-white/40 shadow-2xl backdrop-blur-md dark:bg-surface-800/40"
		>
			<iconify-icon icon="fluent-mdl2:build-definition" width="64" class="text-primary-600 dark:text-primary-400"></iconify-icon>

			<!-- Small Floating Plus -->
			<div
				class="absolute -right-2 -top-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary-500 text-white shadow-lg shadow-primary-500/40"
			>
				<iconify-icon icon="mdi:plus" width="24"></iconify-icon>
			</div>
		</div>
	</div>

	<!-- Text Content -->
	<div class="max-w-md space-y-4" in:fade={{ duration: 400, delay: 400 }}>
		<h2 class="text-3xl font-bold tracking-tight text-black dark:text-white sm:text-4xl">
			Your {publicEnv.SITE_NAME} Blueprint is Empty
		</h2>
		<p class="text-lg leading-relaxed text-surface-600 dark:text-surface-300">
			Create your first collection to start structuring your content. A collection defines the fields and rules for your data.
		</p>
	</div>

	<!-- Call to Action -->
	<div class="mt-10 flex flex-col items-center" in:fade={{ duration: 400, delay: 600 }}>
		<button
			type="button"
			onclick={onAddCollection}
			class="group relative flex items-center justify-center gap-3 overflow-hidden rounded-full bg-primary-500 px-8 py-4 text-lg font-bold text-white shadow-xl transition-all hover:scale-105 hover:bg-primary-600 active:scale-95"
		>
			<iconify-icon icon="ic:round-plus" width="28" class="transition-transform group-hover:rotate-90"></iconify-icon>
			<span>{collection_add()}</span>

			<!-- Subtle Shine Effect -->
			<div class="absolute inset-x-0 top-0 h-1/2 bg-white/20 blur-sm group-hover:bg-white/30"></div>
		</button>

		<p class="mt-6 text-sm italic text-surface-400 dark:text-surface-500">
			At least one collection is required to use the {publicEnv.SITE_NAME} features.
		</p>
	</div>
</div>

<style>
	/* Subtle animation for the floating state */
	.relative > div:first-child {
		animation: float 6s ease-in-out infinite;
	}

	@keyframes float {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-10px);
		}
	}
</style>
