<script lang="ts">
    import { theme, previewTheme } from '@stores/themeStore';

    // ParaglideJS
	import * as m from '@src/paraglide/messages';

    // Component
    import PageTitle from '@components/PageTitle.svelte';

    let selectedTheme: string = 'SveltyCMSTheme'; // Default to SveltyCMSTheme
    let livePreviewTheme: string | null = null;

    // This will hold the custom themes and their corresponding CSS import paths
    let customThemes: { name: string; path: string }[] = [];

    // Load custom themes dynamically
    loadCustomThemes();

    async function loadCustomThemes() {
        // Use Vite's glob feature to load all theme.css files from the custom themes directory
        const customThemesFiles = import.meta.glob('../themes/custom/*/theme.css', { eager: true });

        // Properly type the imported CSS files to avoid TypeScript errors
        customThemes = Object.keys(customThemesFiles).map((key) => {
            const themeName = key.split('/')[3]; // Extract the theme name from the path
            return {
                name: themeName,
                path: customThemesFiles[key] as string, // Assert path type as string
            };
        });
    }

    // Combine default theme with dynamically loaded custom themes
    const themes = ['SveltyCMSTheme', ...customThemes.map(theme => theme.name)];

    // Reactions to theme changes
    $: selectedTheme, theme.set(selectedTheme);
    $: livePreviewTheme, previewTheme.set(livePreviewTheme);

    function applyTheme(themeName: string) {
        selectedTheme = themeName;
        livePreviewTheme = null;
    }

    function previewThemeChange(themeName: string) {
        livePreviewTheme = themeName;
    }

    function resetPreview() {
        livePreviewTheme = null;
    }
</script>

<div class="my-2 flex items-center justify-between">
    <PageTitle name="Theme Management" icon="" />
</div>

<div class="mb-4">
    <label for="theme-select" class="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Select Theme:</label>
    <select id="theme-select" bind:value={selectedTheme} class="select">
        {#each themes as themeName}
            <option value={themeName}>{themeName}</option>
        {/each}
    </select>
</div>

<button on:click={() => applyTheme(selectedTheme)} class="btn variant-filled-tertiary">Apply Theme</button>

<div class="mt-4">
    <h3 class="text-lg font-semibold dark:text-gray-300">Preview Themes:</h3>
    {#each customThemes as { name }}
        <button 
            on:mouseover={() => previewThemeChange(name)} 
            on:mouseout={resetPreview}
            class="mt-2 btn variant-outline-tertiary"
        >
            Preview {name}
        </button>
    {/each}
</div>

{#if customThemes.length === 0}
  <p class="text-center my-2">There are currently no custom themes available. Visit the SveltyCMS marketplace to find new themes.</p>

  <!-- Market Place -->
<a
href="https://www.sveltyCMS.com"
target="_blank"
rel="noopener noreferrer"
class="variant-ghost-primary btn w-full gap-2 py-6"
aria-label={m.config_Martketplace()}
>
<iconify-icon icon="icon-park-outline:shopping-bag" width="28" class="text-white" />
<p class="uppercase">{m.config_Martketplace()}</p>
</a>{/if}