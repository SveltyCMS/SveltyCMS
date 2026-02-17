<!-- 
 @file src/routes/(app)/config/extensions/ThemesView.svelte
 @component Theme Management view for Extensions page
-->

<script lang="ts">
	import type { DatabaseId } from '@src/content/types';
	import type { Theme } from '@src/databases/dbInterface';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { themeStore, updateTheme } from '@stores/themeStore.svelte';
	import { dateToISODateString } from '@utils/dateUtils';

	let selectedTheme = $state<any | null>(null);
	let livePreviewTheme = $state<any | null>(null);

	// This will hold the custom themes
	let customThemes = $state<Theme[]>([]);

	// Load custom themes dynamically
	loadCustomThemes();

	async function loadCustomThemes() {
		// Use Vite's glob feature to load all theme.css files from the custom themes directory
		// Path adjusted relative to this file: ../themes/custom -> ../../themes/custom ?
		// Actually import.meta.glob is relative to the file.
		// Originally: ../themes/custom/*/theme.css from src/routes/(app)/config/themeManagement/+page.svelte
		// Now: src/routes/(app)/config/extensions/ThemesView.svelte
		// Need to go up one more level: ../../themes/custom or better use absolute path if possible or adjust relative
		// The custom themes seem to be in src/routes/(app)/config/themes/custom ?? No, likely src/themes ?
		// Let's use the same relative path structure as before but adjusted.
		// Previous: ../themes/custom -> src/routes/(app)/config/themes/custom (unlikely) or src/themes?
		// Usually themes are in src/themes.
		// If original file was in src/routes/(app)/config/themeManagement
		// Then ../themes equal src/routes/(app)/config/themes.
		// If I'm in src/routes/(app)/config/extensions
		// I need ../themes/custom as well if themes are in src/routes/(app)/config/themes

		const customThemesFiles = import.meta.glob('../../themes/custom/*/theme.css', { eager: true });

		// Convert the imported files to Theme objects
		customThemes = Object.entries(customThemesFiles).map(([key, value], index) => {
			const nowIso = dateToISODateString(new Date());
			return {
				_id: `custom-theme-${index}` as unknown as DatabaseId,
				name: key.split('/')[3],
				path: value as string,
				isDefault: false,
				isActive: false,
				config: { tailwindConfigPath: '', assetsPath: '' },
				createdAt: nowIso,
				updatedAt: nowIso
			} as Theme;
		});
	}

	// Combine default theme with dynamically loaded custom themes
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

	// Effects for theme changes
	$effect.root(() => {
		if (selectedTheme) updateTheme(selectedTheme.name);
	});

	$effect.root(() => {
		if (livePreviewTheme) updateTheme(livePreviewTheme.name);
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
		if (selectedTheme) updateTheme(selectedTheme.name);
	}

	function handleThemeChange() {
		if (selectedTheme) {
			applyTheme(selectedTheme);
		}
	}
</script>

<div class="space-y-6">
	<div class="card p-4">
		<header class="card-header">
			<h3 class="h3 font-bold">Theme Settings</h3>
		</header>
		<section class="p-4">
			<label for="theme-select" class="mb-2 block font-bold">Current System Theme:</label>
			<select
				id="theme-select"
				value={selectedTheme?._id}
				class="select max-w-md"
				onchange={(e) => {
					const id = e.currentTarget.value;
					const theme = themes.find((t) => t._id === id);
					if (theme) {
						selectedTheme = theme;
						handleThemeChange();
					}
				}}
			>
				{#each themes as theme (theme._id)}
					<option value={theme._id} selected={selectedTheme?._id === theme._id}>{theme.name}</option>
				{/each}
			</select>
		</section>
	</div>

	<div class="card p-4">
		<header class="card-header">
			<h3 class="h3 font-bold">Available Themes</h3>
		</header>
		<section class="p-4">
			{#if customThemes.length > 0}
				<div class="flex flex-wrap gap-2">
					{#each customThemes as theme (theme._id)}
						<button
							onmouseover={() => previewThemeChange(theme)}
							onfocus={() => previewThemeChange(theme)}
							onmouseout={resetPreview}
							onblur={resetPreview}
							class="preset-outline-tertiary-500 btn"
						>
							Preview {theme.name}
						</button>
					{/each}
				</div>
			{:else}
				<div class="text-center sm:text-left">
					<p class="mb-4 text-surface-500 dark:text-surface-50">
						There are currently no custom themes available. Visit the SveltyCMS marketplace to find new themes.
					</p>
					<!-- Market Place -->
					<a
						href="https://www.sveltyCMS.com"
						target="_blank"
						rel="noopener noreferrer"
						aria-label={m.marketplace()}
						class="preset-filled-primary-500 btn gap-2"
					>
						<iconify-icon icon="icon-park-outline:shopping-bag" width={20}></iconify-icon>
						<span>{m.marketplace()}</span>
					</a>
				</div>
			{/if}
		</section>
	</div>
</div>
