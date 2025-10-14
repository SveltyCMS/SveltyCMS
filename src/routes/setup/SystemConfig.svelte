<!--
@file src/routes/setup/SystemConfig.svelte
@summary
SveltyCMS Setup Wizard – System Configuration Step

This component handles the system configuration step of the SveltyCMS setup wizard. It allows the user to:
- Enter the site name
- Select the default language (auto-detected from browser if available)
- Select available languages
- Select the timezone (auto-detected and preset to user's local timezone if supported)
- Set the media storage path
- View and resolve validation errors

Key Features:
- Uses Svelte 5 runes for state management
- TypeScript for type safety
- Skeleton UI for consistent styling
- Smart presetting of timezone and language fields based on user environment
- Fully modular and ready for integration into multi-step setup flows
-->

<script lang="ts">
	import * as m from '@src/paraglide/messages';
	import iso6391 from '@utils/iso639-1.json';
	import { getLanguageName } from '@utils/languageUtils';
	import { popup, type PopupSettings } from '@skeletonlabs/skeleton';
	import type { SystemSettings } from '@stores/setupStore.svelte';

	// --- PROPS ---
	const {
		systemSettings,
		validationErrors,
		availableLanguages = [] // system lange form paraglideJS
	} = $props<{
		systemSettings: SystemSettings;
		validationErrors: Record<string, string>;
		availableLanguages?: string[];
	}>();

	// Utility: human friendly language label
	function displayLang(code: string) {
		try {
			// Try to find in full ISO list first for content languages
			const isoLang = iso6391.find((l) => l.code === code);
			if (isoLang) return `${isoLang.name} (${isoLang.native})`;
			// Fallback for system languages which might have different source
			if (availableLanguages.includes(code)) return `${getLanguageName(code)} (${code.toUpperCase()})`;
			// Final fallback for any other case
			return /[a-z]{2,}/i.test(code) ? `${code.toLowerCase()} (${code.toUpperCase()})` : code;
		} catch {
			return code;
		}
	}

	// System languages chip management
	function removeSystemLang(code: string) {
		if (code === systemSettings.defaultSystemLanguage) return;
		systemSettings.systemLanguages = systemSettings.systemLanguages.filter((c: string) => c !== code);
		if (!systemSettings.systemLanguages.includes(systemSettings.defaultSystemLanguage)) {
			systemSettings.defaultSystemLanguage = systemSettings.systemLanguages[0] || 'en';
		}
	}
	let showSystemPicker = $state(false);
	let systemPickerSearch = $state('');
	function openSystemPicker() {
		showSystemPicker = true;
		queueMicrotask(() => document.getElementById('system-lang-search')?.focus());
	}
	function closeSystemPicker() {
		showSystemPicker = false;
		systemPickerSearch = '';
	}
	function addSystemLanguage(code: string) {
		const c = code.toLowerCase();
		if (!availableLanguages.includes(c)) return; // ✅ restrict to project languages only
		if (!systemSettings.systemLanguages.includes(c)) {
			systemSettings.systemLanguages = [...systemSettings.systemLanguages, c];
			if (!systemSettings.defaultSystemLanguage) systemSettings.defaultSystemLanguage = c;
		}
		closeSystemPicker();
	}
	$effect(() => {
		if (!showSystemPicker) return;
		const handler = (e: MouseEvent) => {
			const el = document.getElementById('system-lang-picker');
			if (el && !el.contains(e.target as Node)) closeSystemPicker();
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	});
	function onSystemPickerKey(e: KeyboardEvent) {
		if (e.key === 'Escape') closeSystemPicker();
	}

	// Content languages chip management
	function removeContentLang(code: string) {
		if (code === systemSettings.defaultContentLanguage) return;
		systemSettings.contentLanguages = systemSettings.contentLanguages.filter((c: string) => c !== code);
		if (!systemSettings.contentLanguages.includes(systemSettings.defaultContentLanguage)) {
			systemSettings.defaultContentLanguage = systemSettings.contentLanguages[0] || '';
		}
	}
	let showContentPicker = $state(false);
	let contentPickerSearch = $state('');

	function openContentPicker() {
		showContentPicker = true;
		queueMicrotask(() => document.getElementById('content-lang-search')?.focus());
	}

	function closeContentPicker() {
		showContentPicker = false;
		contentPickerSearch = '';
	}

	function addContentLanguage(code: string) {
		const c = code.toLowerCase();
		if (!c || c.length !== 2 || !iso6391.some((lang) => lang.code === c)) return;
		if (!systemSettings.contentLanguages.includes(c)) {
			systemSettings.contentLanguages = [...systemSettings.contentLanguages, c];
			if (!systemSettings.defaultContentLanguage) systemSettings.defaultContentLanguage = c;
		}
		closeContentPicker();
	}
	$effect(() => {
		if (!showContentPicker) return;
		const handler = (e: MouseEvent) => {
			const el = document.getElementById('content-lang-picker');
			if (el && !el.contains(e.target as Node)) closeContentPicker();
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	});
	function onContentPickerKey(e: KeyboardEvent) {
		if (e.key === 'Escape') closeContentPicker();
		if (e.key === 'Enter') {
			e.preventDefault();
			addContentLanguage(contentPickerSearch.trim());
		}
	}

	// Derived available suggestions
	let systemAvailable = $state<string[]>([]);
	let contentAvailable = $state<{ code: string; name: string; native: string }[]>([]);
	$effect(() => {
		// ✅ system languages can only be those defined in availableLanguages
		systemAvailable = availableLanguages.filter(
			(l: string) => !systemSettings.systemLanguages.includes(l) && l.toLowerCase().includes(systemPickerSearch.toLowerCase())
		);

		// ✅ content languages can still be from iso6391 (no restriction)
		const search = contentPickerSearch.toLowerCase();
		contentAvailable = iso6391.filter(
			(lang) =>
				!systemSettings.contentLanguages.includes(lang.code) &&
				(lang.code.toLowerCase().includes(search) || lang.name.toLowerCase().includes(search) || lang.native.toLowerCase().includes(search))
		);
	});

	// Per-label popup settings (click for better mobile support; still discoverable via icon hover cursor)
	const popupSiteName: PopupSettings = { event: 'click', target: 'popupSiteName', placement: 'top' };
	const popupHostProd: PopupSettings = { event: 'click', target: 'popupHostProd', placement: 'top' };
	const popupDefaultSystem: PopupSettings = { event: 'click', target: 'popupDefaultSystem', placement: 'top' };
	const popupSystemLanguages: PopupSettings = { event: 'click', target: 'popupSystemLanguages', placement: 'top' };
	const popupContentLanguages: PopupSettings = { event: 'click', target: 'popupContentLanguages', placement: 'top' };
	const popupDefaultContent: PopupSettings = { event: 'click', target: 'popupDefaultContent', placement: 'top' };
	const popupMediaPath: PopupSettings = { event: 'click', target: 'popupMediaPath', placement: 'top' };
	const popupMediaFolder: PopupSettings = { event: 'click', target: 'popupMediaFolder', placement: 'top' };
</script>

<div class="fade-in">
	<!-- System Settings -->
	<div class="mb-8">
		<p class="text-sm text-tertiary-500 dark:text-primary-500 sm:text-base">
			Configure the basic settings for your CMS including site name, language preferences, and media storage.
		</p>
	</div>

	<div class="space-y-10">
		<!-- Basic Site Settings -->
		<section>
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<!-- Site Name & Production URL Group -->
				<div class="space-y-3">
					<label for="site-name" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:web" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span>{m.setup_system_site_name?.() || 'CMS Name'}</span>
						<button
							type="button"
							tabindex="-1"
							use:popup={popupSiteName}
							aria-label="Help: Site Name"
							class="ml-1 text-slate-400 hover:text-primary-500"
						>
							<iconify-icon icon="mdi:help-circle-outline" width="16"></iconify-icon>
						</button>
					</label>
					<div
						data-popup="popupSiteName"
						class="card z-30 hidden w-72 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
					>
						<p>{m.setup_help_site_name()}</p>
						<div class="arrow bg-surface-50 dark:bg-surface-700"></div>
					</div>
					<input
						id="site-name"
						bind:value={systemSettings.siteName}
						oninput={(e) => (systemSettings.siteName = (e.target as HTMLInputElement).value.trim())}
						type="text"
						placeholder={m.setup_system_site_name_placeholder?.() || 'My SveltyCMS Site'}
						class="input w-full rounded {validationErrors.siteName ? 'border-error-500' : 'border-slate-200'}"
					/>
					{#if validationErrors.siteName}<div class="mt-1 text-xs text-error-500">{validationErrors.siteName}</div>{/if}

					<label for="host-prod" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:earth" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span>Production URL</span>
						<button
							type="button"
							tabindex="-1"
							use:popup={popupHostProd}
							aria-label="Help: Production URL"
							class="ml-1 text-slate-400 hover:text-primary-500"
						>
							<iconify-icon icon="mdi:help-circle-outline" width="16"></iconify-icon>
						</button>
					</label>
					<div
						data-popup="popupHostProd"
						class="card z-30 hidden w-80 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
					>
						<p>The production URL where your CMS will be accessible (e.g., https://mysite.com). Used for OAuth callbacks and email links.</p>
						<div class="arrow bg-surface-50 dark:bg-surface-700"></div>
					</div>
					<input
						id="host-prod"
						bind:value={systemSettings.hostProd}
						type="url"
						placeholder="https://mysite.com"
						class="input w-full rounded {validationErrors.hostProd ? 'border-error-500' : 'border-slate-200'}"
					/>
					{#if validationErrors.hostProd}<div class="mt-1 text-xs text-error-500">{validationErrors.hostProd}</div>{/if}
				</div>

				<!-- Media Storage Configuration Group -->
				<div class="space-y-3">
					<label for="media-storage-type" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:cloud-outline" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span>Media Storage Type</span>
						<button
							type="button"
							tabindex="-1"
							use:popup={popupMediaPath}
							aria-label="Help: Media Storage Type"
							class="ml-1 text-slate-400 hover:text-primary-500"
						>
							<iconify-icon icon="mdi:help-circle-outline" width="14"></iconify-icon>
						</button>
					</label>
					<div
						data-popup="popupMediaPath"
						class="card z-30 hidden w-80 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
					>
						<p>{m.setup_help_media_path()}</p>
						<div class="arrow border border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700"></div>
					</div>

					<select id="media-storage-type" bind:value={systemSettings.mediaStorageType} class="input w-full rounded">
						<option value="local">📁 Local Storage</option>
						<option value="s3">☁️ Amazon S3</option>
						<option value="r2">☁️ Cloudflare R2</option>
						<option value="cloudinary">☁️ Cloudinary</option>
					</select>

					<label for="media-folder" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:folder" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span>{systemSettings.mediaStorageType === 'local' ? 'Media Folder Path' : 'Bucket/Cloud Name'}</span>
						<button
							type="button"
							tabindex="-1"
							use:popup={popupMediaFolder}
							aria-label="Help: Media Folder"
							class="ml-1 text-slate-400 hover:text-primary-500"
						>
							<iconify-icon icon="mdi:help-circle-outline" width="14"></iconify-icon>
						</button>
					</label>
					<div
						data-popup="popupMediaFolder"
						class="card z-30 hidden w-80 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
					>
						<p>
							For local storage: specify the folder path where media files will be stored (e.g., ./mediaFolder). For cloud storage: enter the bucket
							or container name.
						</p>
						<div class="arrow border border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700"></div>
					</div>
					<input
						id="media-folder"
						bind:value={systemSettings.mediaFolder}
						type="text"
						placeholder={systemSettings.mediaStorageType === 'local' ? './mediaFolder' : 'my-bucket-name'}
						class="input w-full rounded"
					/>

					{#if systemSettings.mediaStorageType !== 'local'}
						<div class="rounded-md border border-amber-300/50 bg-amber-50/50 p-3 dark:border-amber-700/50 dark:bg-amber-900/20">
							<p class="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
								<iconify-icon icon="mdi:information-outline" width="16"></iconify-icon>
								<strong>Note:</strong> Cloud storage credentials (API keys, secrets, regions) must be configured in System Settings after setup is complete.
							</p>
						</div>
					{/if}
				</div>
			</div>
		</section>
		<!-- Languages -->
		<section class="space-y-6">
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<div class="space-y-3 rounded-md border border-slate-300/50 bg-surface-50/60 p-4 dark:border-slate-600/60 dark:bg-surface-800/40">
					<label for="default-system-lang" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:translate" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span>{m.setup_label_default_system_language?.() || m.setup_help_default_system_language?.() || 'Default System Language'}</span>
						<button
							tabindex="-1"
							type="button"
							use:popup={popupDefaultSystem}
							aria-label="Help: Default System Language"
							class="ml-1 text-slate-400 hover:text-primary-500"
						>
							<iconify-icon icon="mdi:help-circle-outline" width="16"></iconify-icon>
						</button>
					</label>
					<div
						data-popup="popupDefaultSystem"
						class="card z-30 hidden w-72 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
					>
						<p>{m.setup_help_default_system_language()}</p>
						<div class="arrow border border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700"></div>
					</div>
					<select id="default-system-lang" bind:value={systemSettings.defaultSystemLanguage} class="input w-full rounded">
						{#each systemSettings.systemLanguages as lang}
							<option value={lang}>{displayLang(lang)}</option>
						{/each}
					</select>
					<div>
						<div class="mb-1 flex items-center gap-1 text-sm font-medium tracking-wide">
							<iconify-icon icon="mdi:translate-variant" width="14" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
							<span>{m.setup_label_system_languages?.() || m.setup_help_system_languages?.() || 'System Languages'}</span>
							<button
								tabindex="-1"
								type="button"
								use:popup={popupSystemLanguages}
								aria-label="Help: System Languages"
								class="ml-1 text-slate-400 hover:text-primary-500"
							>
								<iconify-icon icon="mdi:help-circle-outline" width="14"></iconify-icon>
							</button>
						</div>
						<div
							data-popup="popupSystemLanguages"
							class="card z-30 hidden w-72 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
						>
							<p>{m.setup_help_system_languages()}</p>
							<div class="arrow border border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700"></div>
						</div>
						<div
							class="relative flex flex-wrap gap-2 rounded border border-slate-300/50 bg-surface-50 p-2 pr-16 dark:border-slate-600 dark:bg-surface-700/40"
						>
							{#each systemSettings.systemLanguages as lang}
								<span class="group variant-ghost-tertiary badge inline-flex items-center gap-1 rounded-full dark:variant-ghost-primary">
									{displayLang(lang)}
									{#if systemSettings.systemLanguages.length > 1}
										<button
											type="button"
											class="opacity-60 transition hover:opacity-100"
											onclick={() => removeSystemLang(lang)}
											aria-label="Remove language"
										>
											&times;
										</button>
									{/if}
								</span>
							{/each}
							{#if systemAvailable.length}
								<button
									type="button"
									class="variant-filled-surface badge absolute right-2 top-2 rounded-full"
									onclick={openSystemPicker}
									aria-haspopup="dialog"
									aria-expanded={showSystemPicker}
									aria-controls="system-lang-picker"
								>
									<iconify-icon icon="mdi:plus" width="14"></iconify-icon>
									{m.button_add?.() || 'Add'}
								</button>
							{/if}
							{#if showSystemPicker}
								<div
									id="system-lang-picker"
									class="absolute left-0 top-full z-20 mt-2 w-64 rounded-md border border-slate-300/60 bg-surface-50 p-2 shadow-lg dark:border-slate-600 dark:bg-surface-800"
									role="dialog"
									aria-label="Add system language"
									tabindex="-1"
									onkeydown={onSystemPickerKey}
								>
									<input
										id="system-lang-search"
										class="mb-2 w-full rounded border border-slate-300/60 bg-transparent px-2 py-1 text-xs outline-none focus:border-primary-500 dark:border-slate-600"
										placeholder="Search..."
										bind:value={systemPickerSearch}
									/>
									<div class="max-h-48 overflow-auto">
										{#if systemAvailable.length === 0}
											<p class="px-1 py-2 text-center text-[11px] text-slate-500">{m.setup_help_no_matches?.() || 'No matches'}</p>
										{/if}
										{#each systemAvailable as sug}
											<button
												type="button"
												class="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-primary-500/10"
												onclick={() => addSystemLanguage(sug)}
											>
												<span>{displayLang(sug)}</span>
												<iconify-icon icon="mdi:plus-circle-outline" width="14" class="text-primary-500"></iconify-icon>
											</button>
										{/each}
									</div>
								</div>
							{/if}
						</div>
						<p class="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
							{#if systemAvailable.length > 0}
								Click + to add more languages. At least one language must remain.
							{:else}
								All configured system languages are active.
							{/if}
						</p>
					</div>
				</div>
				<div class="space-y-3 rounded-md border border-slate-300/50 bg-surface-50/60 p-4 dark:border-slate-600/60 dark:bg-surface-800/40">
					<div class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:book-open-page-variant" width="18" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						<span>{m.setup_label_default_content_language?.() || m.setup_help_default_content_language?.() || 'Default Content Language'}</span>
						<button
							tabindex="-1"
							type="button"
							use:popup={popupDefaultContent}
							aria-label="Help: Default Content Language"
							class="ml-1 text-slate-400 hover:text-primary-500"
						>
							<iconify-icon icon="mdi:help-circle-outline" width="16"></iconify-icon>
						</button>
					</div>
					<div
						data-popup="popupDefaultContent"
						class="card z-30 hidden w-72 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
					>
						<p>{m.setup_help_default_content_language()}</p>
						<div class="arrow border border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700"></div>
					</div>
					<select
						bind:value={systemSettings.defaultContentLanguage}
						class="input w-full rounded {validationErrors.defaultContentLanguage ? 'border-error-500' : ''}"
					>
						{#each systemSettings.contentLanguages as lang}
							<option value={lang}>{displayLang(lang)}</option>
						{/each}
					</select>
					{#if validationErrors.defaultContentLanguage}
						<div class="mt-1 text-xs text-error-500">{validationErrors.defaultContentLanguage}</div>
					{/if}
					<div>
						<div class="mb-1 flex items-center gap-1 text-sm font-medium tracking-wide">
							<iconify-icon icon="mdi:book-multiple" width="14" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
							<span>{m.setup_label_content_languages?.() || m.setup_help_content_languages?.() || 'Content Languages'}</span>
							<button
								tabindex="-1"
								type="button"
								use:popup={popupContentLanguages}
								aria-label="Help: Content Languages"
								class="ml-1 text-slate-400 hover:text-primary-500"
							>
								<iconify-icon icon="mdi:help-circle-outline" width="14"></iconify-icon>
							</button>
						</div>
						<div
							data-popup="popupContentLanguages"
							class="card z-30 hidden w-72 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
						>
							<p>{m.setup_help_content_languages()}</p>
							<div class="arrow border border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700"></div>
						</div>
						<div
							class="relative flex flex-wrap gap-2 rounded border p-2 pr-16 {validationErrors.contentLanguages
								? 'border-error-500 bg-error-50 dark:bg-error-900/20'
								: 'border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700/40'}"
						>
							{#each systemSettings.contentLanguages as lang}
								<span class="group variant-ghost-tertiary badge inline-flex items-center gap-1 rounded-full dark:variant-ghost-primary">
									{displayLang(lang)}
									{#if lang !== systemSettings.defaultContentLanguage}
										<button
											type="button"
											class="opacity-60 transition hover:opacity-100"
											onclick={() => removeContentLang(lang)}
											aria-label="Remove language"
										>
											&times;
										</button>
									{/if}
								</span>
							{/each}
							<button
								type="button"
								class="variant-filled-surface badge absolute right-2 top-2 rounded-full"
								onclick={openContentPicker}
								aria-haspopup="dialog"
								aria-expanded={showContentPicker}
								aria-controls="content-lang-picker"
							>
								<iconify-icon icon="mdi:plus" width="14"></iconify-icon>
								{m.button_add?.() || 'Add'}
							</button>
							{#if showContentPicker}
								<div
									id="content-lang-picker"
									class="absolute left-0 top-full z-20 mt-2 w-64 rounded-md border border-slate-300/60 bg-surface-50 p-2 shadow-lg dark:border-slate-600 dark:bg-surface-800"
									role="dialog"
									aria-label="Add content language"
									tabindex="-1"
									onkeydown={onContentPickerKey}
								>
									<input
										id="content-lang-search"
										class="mb-2 w-full rounded border border-slate-300/60 bg-transparent px-2 py-1 text-xs outline-none focus:border-primary-500 dark:border-slate-600"
										placeholder="Search or type code..."
										bind:value={contentPickerSearch}
									/>
									{#if contentPickerSearch.trim() && !availableLanguages.includes(contentPickerSearch.trim())}
										<button
											type="button"
											class="mb-2 w-full rounded bg-primary-500/10 px-2 py-1 text-left text-xs text-primary-600 hover:bg-primary-500/20 dark:text-primary-300"
											onclick={() => addContentLanguage(contentPickerSearch.trim())}
											>{m.button_add_code?.({ code: contentPickerSearch.trim() }) || `Add "${contentPickerSearch.trim()}"`}</button
										>
									{/if}
									<div class="max-h-48 overflow-auto">
										{#if contentAvailable.length === 0}
											<p class="px-1 py-2 text-center text-[11px] text-slate-500">{m.setup_help_no_matches?.() || 'No matches'}</p>
										{/if}
										{#each contentAvailable as sug}
											<button
												type="button"
												class="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-primary-500/10"
												onclick={() => addContentLanguage(sug.code)}
											>
												<span
													>{sug.name} ({sug.code.toUpperCase()})
													<span class="text-slate-500 dark:text-slate-400"> - {sug.native}</span></span
												>
												<iconify-icon icon="mdi:plus-circle-outline" width="14" class="text-primary-500"></iconify-icon>
											</button>
										{/each}
									</div>
								</div>
							{/if}
						</div>
						<p class="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
							{m.setup_note_add_codes_default_cannot_be_removed?.() || 'Add existing or custom codes. Default cannot be removed.'}
						</p>
						{#if validationErrors.contentLanguages}
							<div class="mt-1 text-xs text-error-500">{validationErrors.contentLanguages}</div>
						{/if}
					</div>
				</div>
			</div>
		</section>

		<!-- Timezone & Media -->
		<section class="space-y-8">
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<!-- <div>
					<label for="timezone" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:clock-outline" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span>Timezone</span>
						<button type="button" use:popup={popupTimezone} aria-label="Help: Timezone" class="ml-1 text-slate-400 hover:text-primary-500">
							<iconify-icon icon="mdi:help-circle-outline" width="14"></iconify-icon>
						</button>
					</label>
					<div
						data-popup="popupTimezone"
						class="card z-30 hidden w-72 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
					>
						<p>Default timezone for scheduling and date display. Users may override in personal settings.</p>
						<div class="arrow border border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700"></div>
					</div>
					<select id="timezone" bind:value={systemSettings.timezone} class="input w-full rounded">
						<option value="UTC">UTC (Coordinated Universal Time)</option>
						<option value="America/New_York">Eastern Time (ET)</option>
						<option value="America/Chicago">Central Time (CT)</option>
						<option value="America/Denver">Mountain Time (MT)</option>
						<option value="America/Los_Angeles">Pacific Time (PT)</option>
						<option value="Europe/London">London (GMT)</option>
						<option value="Europe/Paris">Paris (CET)</option>
						<option value="Asia/Tokyo">Tokyo (JST)</option>
					</select>
				</div> -->
			</div>
		</section>
	</div>
</div>
