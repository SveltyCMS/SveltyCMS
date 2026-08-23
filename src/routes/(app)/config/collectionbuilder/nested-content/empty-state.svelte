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
import Button from "@components/ui/button.svelte";
import {
    collection_add,
    collection_addcategory,
} from "@src/paraglide/messages";
import { fade, scale } from "svelte/transition";
import { publicEnv } from "@src/stores/global-settings.svelte";

interface Props {
    onAddCollection: () => void;
    newCollectionHref: string;
    onAddCategory: () => void;
    onLoadPreset?: () => void;
    onQuickStart?: () => void;
}

let { onAddCollection, newCollectionHref, onAddCategory, onLoadPreset, onQuickStart }: Props = $props();
</script>

<div class="flex flex-col items-center justify-center p-4 pt-2 py-6 text-center" in:fade={{ duration: 400 }}>
    <!-- Illustration Container -->
    <div
        class="relative mb-4 flex h-36 w-36 items-center justify-center rounded-full bg-linear-to-br from-primary-500/10 to-tertiary-500/10 dark:from-primary-500/5 dark:to-tertiary-500/5"
        in:scale={{ duration: 600, delay: 200, start: 0.8 }}
    >
        <div class="absolute inset-0 animate-pulse rounded-full bg-primary-500/10 blur-2xl"></div>

        <div
            class="relative flex h-24 w-24 items-center justify-center rounded-2xl border border-white/20 bg-white/40 shadow-xl backdrop-blur-md dark:bg-surface-800/40"
        >
            <iconify-icon icon="fluent-mdl2:build-definition" width="48" class="text-primary-600 dark:text-primary-500"></iconify-icon>

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
            Your {publicEnv.SITE_NAME} Blueprint is Empty
        </h2>
        <p class="text-sm leading-relaxed text-surface-600 dark:text-surface-50">
            Start with a Quick Start template for ready-made collections, or add a collection manually. Categories are optional — use them only if you want to group collections in the sidebar.
        </p>
    </div>

    <!-- Call to Action -->
    <div class="mt-6 flex w-full max-w-xl flex-col items-center" in:fade={{ duration: 400, delay: 600 }}>
        <!-- Primary Action Row -->
        <div class="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
            {#if onQuickStart}
                <Button
                    onclick={onQuickStart}
                    variant="primary"
                    rounded={true}
                    size="lg"
                    class="group w-full justify-center h-12"
                    aria-label="Quick Start recommended for new projects"
                >
                    <iconify-icon icon="mdi:magic-staff" width="22" class="transition-transform group-hover:rotate-12"></iconify-icon>
                    <span>Quick Start</span>
                </Button>
            {/if}

            {#if onLoadPreset}
                <Button onclick={onLoadPreset} variant="warning" rounded={true} size="lg" class="group w-full justify-center h-12">
                    <iconify-icon icon="mdi:package-variant" width="22" class="text-white transition-transform group-hover:scale-110"></iconify-icon>
                    <span class="text-white">Load Preset</span>
                </Button>
            {/if}

            {#if onQuickStart}
                <div class="col-span-1 sm:col-span-2 flex justify-center -mt-2">
                    <p class="text-[11px] font-medium text-tertiary-600 dark:text-primary-500">Recommended for new projects</p>
                </div>
            {/if}
        </div>

        <!-- Optional Actions Section -->
        <div class="mt-4 flex w-full flex-col items-center gap-3 border-t border-surface-500/30 pt-4 dark:border-surface-500/40">
            <p class="text-[10px] font-semibold uppercase tracking-wide ">Optional</p>
            <div class="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                <Button
                    onclick={onAddCategory}
                    variant="tertiary"
                    rounded={true}
                    size="lg"
                    class="group w-full justify-center h-12"
                    data-testid="add-category-button"
                >
                    <iconify-icon icon="mdi:folder-plus" width="22" class="transition-transform group-hover:scale-110"></iconify-icon>
                    <span>{collection_addcategory()}</span>
                </Button>

               <Button
                    href={newCollectionHref}
                    data-preload="hover"
                    onclick={onAddCollection}
                    variant="error"
                    rounded={true}
                    size="lg"
                    class="group w-full justify-center h-12"
                    data-testid="add-collection-button"
                    aria-keyshortcuts="Mod+N"
                >
                    <iconify-icon icon="ic:round-plus" width="22" class="transition-transform group-hover:rotate-90"></iconify-icon>
                    <span>{collection_add()}</span>
                </Button>
            </div>
        </div>

        <p class="mt-4 max-w-md text-xs text-surface-600 dark:text-surface-400" role="note">
            Templates apply immediately. Categories and layout changes require <strong>Save</strong>.
        </p>

        <p class="mt-2 text-xs italic text-tertiary-500 dark:text-primary-500">
            At least one collection is required to use the {publicEnv.SITE_NAME} features.
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
