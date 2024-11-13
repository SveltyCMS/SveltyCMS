<!-- 
@file src/routes/(app)/config/themeManagement/+page.svelte
@description This file manages the theme management page. It provides a user-friendly interface for managing themes and custom themes. 
-->

<script lang="ts">
	import { themeStore, updateTheme } from '@root/src/stores/themeStore.svelte';
	import type { Theme } from '@src/databases/dbInterface';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Component
	import PageTitle from '@components/PageTitle.svelte';

	let selectedTheme = $state<Theme | null>(null);
	let livePreviewTheme = $state<Theme | null>(null);

	// This will hold the custom themes
	let customThemes = $state<Theme[]>([]);

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
			createdAt: new Date(),
			updatedAt: new Date()
		}));
	}

	// Combine default theme with dynamically loaded custom themes
	let themes = $derived([
		{
			_id: 'default-theme',
			name: 'SveltyCMSTheme',
			path: '/path/to/default/theme.css',
			isDefault: true,
			createdAt: new Date(),
			updatedAt: new Date()
		},
		...customThemes
	]);

	// Effects for theme changes
	$effect.root(() => {
		if (selectedTheme) updateTheme(selectedTheme);
	});

	$effect.root(() => {
		if (livePreviewTheme) updateTheme(livePreviewTheme);
	});

	// Initialize selectedTheme with current theme
	$effect.root(() => {
		if (themeStore.currentTheme) {
			selectedTheme = themeStore.currentTheme;
		}
	});

	function applyTheme(theme: Theme) {
		selectedTheme = theme;
		livePreviewTheme = null;
	}

	function previewThemeChange(theme: Theme) {
		livePreviewTheme = theme;
	}

	function resetPreview() {
		livePreviewTheme = null;
		if (selectedTheme) updateTheme(selectedTheme);
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
	<select id="theme-select" bind:value={selectedTheme} class="select" onchange={handleThemeChange}>
		{#each themes as theme (theme._id)}
			<option value={theme}>{theme.name}</option>
		{/each}
	</select>
</div>

<div class="mt-4">
	<h3 class="font-bold">Available Themes:</h3>
	{#each customThemes as theme (theme._id)}
		<button
			onmouseover={() => previewThemeChange(theme)}
			onfocus={() => previewThemeChange(theme)}
			onmouseout={resetPreview}
			onblur={resetPreview}
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
		aria-label={m.config_Martketplace()}
		class="variant-ghost-primary btn w-full gap-2 py-6"
	>
		<iconify-icon icon="icon-park-outline:shopping-bag" width="28" class="text-white"></iconify-icon>
		<p class="uppercase">{m.config_Martketplace()}</p>
	</a>
{/if}
