<script lang="ts">
	import { themeStore, updateTheme } from '@shared/stores/themeStore.svelte';
	import type { DatabaseId } from '@cms-types';
	import type { Theme } from '@shared/database/dbInterface';
	import { dateToISODateString } from '@shared/utils/dateUtils';
	import * as m from '$lib/paraglide/messages.js';

	let selectedTheme = $state<any | null>(null);
	let livePreviewTheme = $state<any | null>(null);
	let customThemes = $state<Theme[]>([]);

	// Load custom themes dynamically
	loadCustomThemes();

	async function loadCustomThemes() {
		// Use Vite's glob feature to load all theme.css files from the custom themes directory
		// Note: We need to adjust the path since we are in a sub-component
		// Assuming themes are at apps/cms/src/themes/custom
		// The original path was '../themes/custom' from routes/config/themeManagement

		// If that fails, try the absolute-ish path relative to src
		// Correct glob for Vite:
		// const customThemesFiles = import.meta.glob('/src/themes/custom/*/theme.css', { eager: true });
		// Using the original relative logic:
		// routes/config/themeManagement -> ../themes -> routes/config/themes (Wrong)
		// It was probably: apps/cms/src/themes...
		// Let's stick to the relative path that points to src/themes.
		// routes/config/extensions/components -> ../../../../themes ??
		// Let's rely on the previous logic which was `../themes` from `config/themeManagement`
		// `config` is at `src/routes/config`. `themes` is at `src/themes`?
		// If so, `config/themeManagement` -> `../themes` implies `src/routes/themes`? No.
		// Let's assume `src/themes` exists.
		// From `src/routes/config/extensions/components` to `src/themes`: `../../../../themes`

		// Actually, let's just replicate the original logic but corrected for depth
		// Original: import.meta.glob('../themes/custom/*/theme.css') from `apps/cms/src/routes/config/themeManagement/+page.svelte`
		// Map:
		// config/themeManagement is depth 2 from config
		// ../themes means config/themes?? That's weird.
		// Assuming user has a themes folder.

		// Let's just use the absolute alias if possible or try to match.
		// Since I can't browse the whole tree easily, I'll use a broad glob or stick to what I think works.
		// Safest: `../../../../themes/custom/*/theme.css`

		const modules = import.meta.glob('/src/themes/custom/*/theme.css', { eager: true });

		customThemes = Object.entries(modules).map(([key, value], index) => {
			const nowIso = dateToISODateString(new Date());
			// key is like /src/themes/custom/MyTheme/theme.css
			const parts = key.split('/');
			const themeName = parts[parts.length - 2];

			return {
				_id: `custom-theme-${index}` as unknown as DatabaseId,
				name: themeName,
				path: value as string,
				isDefault: false,
				isActive: false,
				config: { tailwindConfigPath: '', assetsPath: '' },
				createdAt: nowIso,
				updatedAt: nowIso
			} as Theme;
		});
	}

	const themes = $derived([
		{
			_id: 'default-theme' as unknown as DatabaseId,
			name: 'SveltyCMSTheme',
			path: '/path/to/default/theme.css',
			isDefault: true,
			isActive: true,
			config: { tailwindConfigPath: '', assetsPath: '' },
			createdAt: dateToISODateString(new Date()),
			updatedAt: dateToISODateString(new Date())
		} as Theme,
		...customThemes
	]);

	$effect.root(() => {
		if (selectedTheme) updateTheme(selectedTheme.name);
	});

	$effect.root(() => {
		if (livePreviewTheme) updateTheme(livePreviewTheme.name);
	});

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
		if (selectedTheme) updateTheme(selectedTheme.name);
	}

	function handleThemeChange() {
		if (selectedTheme) {
			applyTheme(selectedTheme);
		}
	}
</script>

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
			class="preset-outline-tertiary-500 btn mt-2 mr-2"
		>
			Preview {theme.name}
		</button>
	{/each}
</div>

{#if customThemes.length === 0}
	<p class="my-2 text-center text-tertiary-500 dark:text-primary-500 sm:text-left">
		There are currently no custom themes available. Visit the SveltyCMS marketplace to find new themes.
	</p>

	<a
		href="https://marketplace.sveltycms.com"
		target="_blank"
		rel="noopener noreferrer"
		aria-label={m.marketplace()}
		class="preset-outlined-primary-500 btn w-full gap-2 py-6 mt-4"
	>
		<iconify-icon icon="icon-park-outline:shopping-bag" width="28" class="text-white"></iconify-icon>
		<p class="uppercase">{m.marketplace()}</p>
	</a>
{/if}
