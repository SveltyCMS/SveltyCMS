<!--
@file src/routes/(app)/config/collectionbuilder/nested-content/empty-state.svelte
@component
**Premium Empty State for Collection Builder**

### Features:
- Quick Start as the recommended first path for new users
- Manual collection creation and optional category grouping
- Helper text explaining instant templates vs staged Save workflow
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import SiteName from '@src/components/site-name.svelte';
	import {
		builder_collection_required_part1,
		builder_collection_required_part2,
		builder_empty_blueprint,
		builder_empty_intro,
		builder_empty_your,
		builder_quick_start,
		builder_quick_start_aria,
		builder_quick_start_recommended,
		builder_templates_note_part1,
		button_save,
		collection_add,
		collection_addcategory
	} from '@src/paraglide/messages';
	import { fade, scale } from 'svelte/transition';
	import { publicEnv } from '@src/stores/global-settings.svelte';

	interface Props {
		onAddCollection: () => void;
		newCollectionHref: string;
		onAddCategory: () => void;
		onQuickStart?: () => void;
	}

	let { onAddCollection, newCollectionHref, onAddCategory, onQuickStart }: Props = $props();
</script>

<div
	class="flex flex-col items-center justify-center p-4 pt-2 py-6 text-center"
	in:fade={{ duration: 400 }}
>
	<!-- Illustration Container -->
	<div
		class="relative mb-4 flex h-36 w-36 items-center justify-center rounded-full bg-linear-to-br from-primary-500/10 to-tertiary-500/10 dark:from-primary-500/5 dark:to-tertiary-500/5"
		in:scale={{ duration: 600, delay: 200, start: 0.8 }}
	>
		<div class="absolute inset-0 animate-pulse rounded-full bg-primary-500/10 blur-2xl"></div>

		<div
			class="relative flex h-24 w-24 items-center justify-center rounded-2xl border border-white/20 bg-white/40 shadow-xl backdrop-blur-md dark:bg-surface-800/40"
		>
			<iconify-icon
				icon="fluent-mdl2:build-definition"
				width="48"
				class="text-primary-600 dark:text-primary-500"
			></iconify-icon>

			<div
				class="absolute -inset-e-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary-500 text-white shadow-lg shadow-primary-500/40"
			>
				<iconify-icon icon="mdi:plus" width="20"></iconify-icon>
			</div>
		</div>
	</div>

	<!-- Text Content -->
	<div class="max-w-lg space-y-2" in:fade={{ duration: 400, delay: 400 }}>
		<h2 class="text-2xl font-bold tracking-tight text-black dark:text-white sm:text-3xl">
			{builder_empty_your()}
			<SiteName highlight="CMS" />
			{builder_empty_blueprint()}
		</h2>
		<p class="text-sm leading-relaxed text-surface-600 dark:text-surface-50">
			{builder_empty_intro()}
		</p>
	</div>

	<!-- Call to Action — three actions in a single row -->
	<div class="mt-6 w-full max-w-2xl" in:fade={{ duration: 400, delay: 600 }}>
		<div class="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
			{#if onQuickStart}
				<Button
					onclick={onQuickStart}
					variant="warning"
					size="md"
					class="group w-full min-w-0 justify-center"
					aria-label={builder_quick_start_aria()}
				>
					<iconify-icon
						icon="mdi:magic-staff"
						width="22"
						class="transition-transform group-hover:rotate-12"
					></iconify-icon>
					<span>{builder_quick_start()}</span>
				</Button>
			{/if}

			<Button
				onclick={onAddCategory}
				variant="tertiary"
				size="md"
				class="group w-full min-w-0 justify-center"
				data-testid="add-category-button"
			>
				<iconify-icon
					icon="mdi:folder-plus"
					width="22"
					class="transition-transform group-hover:scale-110"
				></iconify-icon>
				<span>{collection_addcategory()}</span>
			</Button>

			<Button
				href={newCollectionHref}
				data-preload="hover"
				onclick={onAddCollection}
				variant="error"
				size="md"
				class="group w-full min-w-0 justify-center"
				data-testid="add-collection-button"
				aria-keyshortcuts="Mod+N"
			>
				<iconify-icon
					icon="ic:round-plus"
					width="22"
					class="transition-transform group-hover:rotate-90"
				></iconify-icon>
				<span>{collection_add()}</span>
			</Button>
		</div>

		{#if onQuickStart}
			<p
				class="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-medium text-tertiary-600 dark:text-primary-500"
			>
				<iconify-icon icon="mdi:star-four-points" width="12" aria-hidden="true"></iconify-icon>
				{builder_quick_start_recommended()}
			</p>
		{/if}

		<p class="mx-auto mt-4 max-w-md text-xs text-surface-600 dark:text-surface-400" role="note">
			{builder_templates_note_part1()} <strong>{button_save()}</strong>.
		</p>

		<p class="mt-2 text-xs italic text-tertiary-500 dark:text-primary-500">
			{builder_collection_required_part1()}
			{publicEnv.SITE_NAME}
			{builder_collection_required_part2()}
		</p>
	</div>
</div>

<style>
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
