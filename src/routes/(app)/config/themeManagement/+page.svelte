<!-- 
@file src/routes/(app)/config/themeManagement/+page.svelte
@description This file manages the theme management page. It provides a user-friendly interface for managing themes and custom themes. 
-->

<script lang="ts">
	import { theme, updateTheme } from '@stores/themeStore';
	import type { Theme } from '@src/databases/dbInterface';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Component
	import PageTitle from '@components/PageTitle.svelte';

	let selectedTheme: Theme | null = null;
	let livePreviewTheme: Theme | null = null;

	// This will hold the custom themes
	let customThemes: Theme[] = [];

	// Load custom themes dynamically
	loadCustomThemes();

	async function loadCustomThemes() {
		// Use Vite's glob feature to load all theme.css files from the custom themes directory
		const customThemesFiles = import.meta.glob('../themes/custom/*/theme.css', { eager: true });

		// Convert the imported files to Theme objects
		customThemes = Object.entries(customThemesFiles).map(([key, value], index) => ({
			_id: `custom-theme-${index}`,
			name: key.split('/')[3],
			path: value as string,
			isDefault: false,
			createdAt: Date.now(),
			updatedAt: Date.now()
		}));
	}

	// Combine default theme with dynamically loaded custom themes
	$: themes = [
		{
			_id: 'default-theme',
			name: 'SveltyCMSTheme',
			path: '/path/to/default/theme.css',
			isDefault: true,
			createdAt: Date.now(),
			updatedAt: Date.now()
		},
		...customThemes
	];

	// Reactions to theme changes
	$: if (selectedTheme) updateTheme(selectedTheme.name);
	$: if (livePreviewTheme) updateTheme(livePreviewTheme.name);

	function applyTheme(theme: Theme) {
		selectedTheme = theme;
		livePreviewTheme = null;
	}

	function previewThemeChange(theme: Theme) {
		livePreviewTheme = theme;
	}

	function resetPreview() {
		livePreviewTheme = null;
		if (selectedTheme) updateTheme(selectedTheme.name);
	}

	function handleThemeChange() {
		if (selectedTheme) {
			applyTheme(selectedTheme);
		}
	}
</script>

<!-- Page Title with Back Button -->
<PageTitle name="Theme Management" icon="ph:layout" showBackButton={true} backUrl="/config" />

<div class="mb-4">
	<label for="theme-select" class="mb-2 block font-bold">Current System Theme:</label>
	<select id="theme-select" bind:value={selectedTheme} class="select" on:change={handleThemeChange}>
		{#each themes as theme (theme._id)}
			<option value={theme}>{theme.name}</option>
		{/each}
	</select>
</div>

<div class="mt-4">
	<h3 class="font-bold">Available Themes:</h3>
	{#each customThemes as theme (theme._id)}
		<button
			on:mouseover={() => previewThemeChange(theme)}
			on:focus={() => previewThemeChange(theme)}
			on:mouseout={resetPreview}
			on:blur={resetPreview}
			class="variant-outline-tertiary btn mt-2"
		>
			Preview {theme.name}
		</button>
	{/each}
</div>

{#if customThemes.length === 0}
	<p class="my-2 text-center text-tertiary-500 dark:text-primary-500 sm:text-left">
		There are currently no custom themes available. Visit the SveltyCMS marketplace to find new themes.
	</p>

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
	</a>
{/if}
