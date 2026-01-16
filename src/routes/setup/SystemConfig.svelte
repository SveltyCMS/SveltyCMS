<!--
@file src/routes/setup/SystemConfig.svelte
@description System configuration step.
-->
<script lang="ts">
	import * as m from '@src/paraglide/messages';
	import iso6391 from '@utils/iso639-1.json';
	import { getLanguageName } from '@utils/languageUtils';
	import { locales as systemLocales } from '@src/paraglide/runtime';
	// ✅ FIX: Import types from the store
	import type { ValidationErrors } from '@stores/setupStore.svelte';
	import { safeParse } from 'valibot';
	import { systemSettingsSchema } from '@utils/formSchemas';

	// --- PROPS ---
	// ✅ FIX: Added $bindable() to systemSettings
	let { systemSettings = $bindable(), validationErrors } = $props(); // Now uses imported type

	const availableLanguages: string[] = [...systemLocales];

	// Real-time validation state
	let localValidationErrors = $state<Record<string, string>>({});
	let touchedFields = $state(new Set<string>());

	const validationResult = $derived(
		safeParse(systemSettingsSchema, {
			...systemSettings
		})
	);

	$effect(() => {
		const newErrors: ValidationErrors = {};
		if (!validationResult.success) {
			for (const issue of validationResult.issues) {
				const path = issue.path?.[0]?.key as string;
				if (path) {
					newErrors[path] = issue.message;
				}
			}
		}
		localValidationErrors = newErrors;
	});

	const displayErrors = $derived.by(() => {
		const errors: ValidationErrors = {};
		for (const field of touchedFields) {
			if (localValidationErrors[field]) {
				errors[field] = localValidationErrors[field];
			}
		}
		return { ...errors, ...validationErrors };
	});

	function handleBlur(fieldName: string) {
		touchedFields.add(fieldName);
		touchedFields = touchedFields;
	}

	function displayLang(code: string) {
		try {
			const name = getLanguageName(code);
			return `${name} (${code.toUpperCase()})`;
		} catch {
			return code.toUpperCase();
		}
	}

	// System languages
	function removeSystemLang(code: string) {
		if (code === systemSettings.defaultSystemLanguage && systemSettings.systemLanguages.length === 1) return;
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
		if (!availableLanguages.includes(c)) return;
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

	// Content languages
	function removeContentLang(code: string) {
		if (code === systemSettings.defaultContentLanguage && systemSettings.contentLanguages.length === 1) return;
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
		const c = code.toLowerCase().trim();
		if (!c || c.length < 2) return;
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
		systemAvailable = availableLanguages.filter(
			(l: string) => !systemSettings.systemLanguages.includes(l) && l.toLowerCase().includes(systemPickerSearch.toLowerCase())
		);
		const search = contentPickerSearch.toLowerCase();
		contentAvailable = iso6391.filter(
			(lang) =>
				!systemSettings.contentLanguages.includes(lang.code) &&
				(lang.code.toLowerCase().includes(search) || lang.name.toLowerCase().includes(search) || lang.native.toLowerCase().includes(search))
		);
	});
</script>

<div class="fade-in">
	<div class="mb-8">
		<p class="text-sm text-tertiary-500 dark:text-primary-500 sm:text-base">
			{m.setup_system_intro()}
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
							title="Help available"
							aria-label="Help: Site Name"
							class="ml-1 text-slate-400 hover:text-primary-500"
						>
							<iconify-icon icon="mdi:help-circle-outline" width="16" aria-hidden="true"></iconify-icon>
						</button>
					</label>
					<div
						data-popup="popupSiteName"
						class="card z-30 hidden w-72 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
					>
						<p>{m.setup_help_site_name()}</p>
						<div class="arrow border border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700"></div>
					</div>
					<input
						id="site-name"
						bind:value={systemSettings.siteName}
						onblur={() => handleBlur('siteName')}
						type="text"
						placeholder={m.setup_system_site_name_placeholder?.() || 'My SveltyCMS Site'}
						class="input w-full rounded {displayErrors.siteName ? 'border-error-500' : 'border-slate-200'}"
						aria-invalid={!!displayErrors.siteName}
						aria-describedby={displayErrors.siteName ? 'site-name-error' : undefined}
					/>
					{#if displayErrors.siteName}
						<div id="site-name-error" class="mt-1 text-xs text-error-500" role="alert">{displayErrors.siteName}</div>
					{/if}

					<label for="host-prod" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:earth" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span>Production URL</span>
						<button
							type="button"
							tabindex="-1"
							title="Help available"
							aria-label="Help: Production URL"
							class="ml-1 text-slate-400 hover:text-primary-500"
						>
							<iconify-icon icon="mdi:help-circle-outline" width="16" aria-hidden="true"></iconify-icon>
						</button>
					</label>
					<div
						data-popup="popupHostProd"
						class="card z-30 hidden w-80 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
					>
						<p>The production URL where your CMS will be accessible (e.g., https://mysite.com). Used for OAuth callbacks and email links.</p>
						<div class="arrow border border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700"></div>
					</div>
					<input
						id="host-prod"
						bind:value={systemSettings.hostProd}
						type="url"
						onblur={() => handleBlur('hostProd')}
						placeholder="https://mysite.com"
						class="input w-full rounded {displayErrors.hostProd ? 'border-error-500' : 'border-slate-200'}"
						aria-invalid={!!displayErrors.hostProd}
						aria-describedby={displayErrors.hostProd ? 'host-prod-error' : undefined}
					/>
					{#if displayErrors.hostProd}
						<div id="host-prod-error" class="mt-1 text-xs text-error-500" role="alert">{displayErrors.hostProd}</div>
					{/if}
				</div>

				<!-- Media Storage Configuration Group -->
				<div class="space-y-3">
					<label for="media-storage-type" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:cloud-outline" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span>Media Storage Type</span>
						<button
							type="button"
							tabindex="-1"
							title="Help available"
							aria-label="Help: Media Storage Type"
							class="ml-1 text-slate-400 hover:text-primary-500"
						>
							<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
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
							title="Help available"
							aria-label="Help: Media Folder"
							class="ml-1 text-slate-400 hover:text-primary-500"
						>
							<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
						</button>
					</label>
					<div
						data-popup="popupMediaFolder"
						class="card z-30 hidden w-80 rounded-md border border-slate-300/50 bg-surface-50 p-3 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700"
					>
						<p>For local storage: specify the folder path (e.g., ./mediaFolder). For cloud storage: enter the bucket or container name.</p>
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
						<div class="rounded-md border border-amber-300/50 bg-amber-50/50 p-3 dark:border-amber-700/50 dark:bg-amber-900/20" role="status">
							<p class="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
								<iconify-icon icon="mdi:information-outline" width="16" aria-hidden="true"></iconify-icon>
								<strong>Note:</strong>
								Cloud storage credentials must be configured in System Settings after setup.
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
						<span>{m.setup_label_default_system_language?.() || 'Default System Language'}</span>
						<button
							tabindex="-1"
							type="button"
							title="Help available"
							aria-label="Help: Default System Language"
							class="ml-1 text-slate-400 hover:text-primary-500"
						>
							<iconify-icon icon="mdi:help-circle-outline" width="16" aria-hidden="true"></iconify-icon>
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
						{#each systemSettings.systemLanguages as lang (lang)}
							<option value={lang}>{displayLang(lang)}</option>
						{/each}
					</select>
					<div>
						<div class="mb-1 flex items-center gap-1 text-sm font-medium tracking-wide">
							<iconify-icon icon="mdi:translate-variant" width="14" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
							<span>{m.setup_label_system_languages?.() || 'System Languages'}</span>
							<button
								tabindex="-1"
								type="button"
								title="Help available"
								aria-label="Help: System Languages"
								class="ml-1 text-slate-400 hover:text-primary-500"
							>
								<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
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
							class="relative flex min-h-[42px] flex-wrap items-center gap-2 rounded border border-slate-300/50 bg-surface-50 p-2 pr-16 dark:border-slate-600 dark:bg-surface-700/40"
						>
							{#each systemSettings.systemLanguages as lang (lang)}
								<span class="group preset-ghost-tertiary-500 badge inline-flex items-center gap-1 rounded-full dark:preset-ghost-primary-500">
									{displayLang(lang)}
									{#if systemSettings.systemLanguages.length > 1}
										<button
											type="button"
											class="opacity-60 transition hover:opacity-100"
											onclick={() => removeSystemLang(lang)}
											aria-label={`Remove ${displayLang(lang)}`}
										>
											×
										</button>
									{/if}
								</span>
							{/each}
							{#if systemAvailable.length}
								<button
									type="button"
									class="preset-filled-surface-500 badge absolute right-2 top-1/2 -translate-y-1/2 rounded-full"
									onclick={openSystemPicker}
									aria-haspopup="dialog"
									aria-expanded={showSystemPicker}
									aria-controls="system-lang-picker"
								>
									<iconify-icon icon="mdi:plus" width="14" aria-hidden="true"></iconify-icon>
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
										{#each systemAvailable as sug (sug)}
											<button
												type="button"
												class="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-primary-500/10"
												onclick={() => addSystemLanguage(sug)}
											>
												<span>{displayLang(sug)}</span>
												<iconify-icon icon="mdi:plus-circle-outline" width="14" class="text-primary-500" aria-hidden="true"></iconify-icon>
											</button>
										{/each}
									</div>
								</div>
							{/if}
						</div>
						<p class="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
							{systemAvailable.length > 0 ? 'Click + to add more languages.' : 'All configured system languages are active.'}
						</p>
					</div>
				</div>
				<div class="space-y-3 rounded-md border border-slate-300/50 bg-surface-50/60 p-4 dark:border-slate-600/60 dark:bg-surface-800/40">
					<div class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:book-open-page-variant" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"
						></iconify-icon>
						<span>{m.setup_label_default_content_language?.() || 'Default Content Language'}</span>
						<button
							tabindex="-1"
							type="button"
							title="Help available"
							aria-label="Help: Default Content Language"
							class="ml-1 text-slate-400 hover:text-primary-500"
						>
							<iconify-icon icon="mdi:help-circle-outline" width="16" aria-hidden="true"></iconify-icon>
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
						onblur={() => handleBlur('defaultContentLanguage')}
						class="input w-full rounded {displayErrors.defaultContentLanguage ? 'border-error-500' : ''}"
						aria-invalid={!!displayErrors.defaultContentLanguage}
						aria-describedby={displayErrors.defaultContentLanguage ? 'default-content-lang-error' : undefined}
					>
						{#each systemSettings.contentLanguages as lang (lang)}
							<option value={lang}>{displayLang(lang)}</option>
						{/each}
					</select>
					{#if displayErrors.defaultContentLanguage}
						<div id="default-content-lang-error" class="mt-1 text-xs text-error-500" role="alert">{displayErrors.defaultContentLanguage}</div>
					{/if}
					<div>
						<div class="mb-1 flex items-center gap-1 text-sm font-medium tracking-wide">
							<iconify-icon icon="mdi:book-multiple" width="14" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
							<span>{m.setup_label_content_languages?.() || 'Content Languages'}</span>
							<button
								tabindex="-1"
								type="button"
								title="Help available"
								aria-label="Help: Content Languages"
								class="ml-1 text-slate-400 hover:text-primary-500"
							>
								<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
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
							class="relative flex min-h-[42px] flex-wrap items-center gap-2 rounded border p-2 pr-16 {displayErrors.contentLanguages
								? 'border-error-500 bg-error-50 dark:bg-error-900/20'
								: 'border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700/40'}"
						>
							{#each systemSettings.contentLanguages as lang (lang)}
								<span class="group preset-ghost-tertiary-500 badge inline-flex items-center gap-1 rounded-full dark:preset-ghost-primary-500">
									{displayLang(lang)}
									{#if lang !== systemSettings.defaultContentLanguage || systemSettings.contentLanguages.length > 1}
										<button
											type="button"
											class="opacity-60 transition hover:opacity-100"
											onclick={() => removeContentLang(lang)}
											aria-label={`Remove ${displayLang(lang)}`}
										>
											×
										</button>
									{/if}
								</span>
							{/each}
							<button
								type="button"
								class="preset-filled-surface-500 badge absolute right-2 top-1/2 -translate-y-1/2 rounded-full"
								onclick={openContentPicker}
								aria-haspopup="dialog"
								aria-expanded={showContentPicker}
								aria-controls="content-lang-picker"
							>
								<iconify-icon icon="mdi:plus" width="14" aria-hidden="true"></iconify-icon>
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
										placeholder="Search languages..."
										bind:value={contentPickerSearch}
									/>
									<div class="max-h-48 overflow-auto">
										{#if contentAvailable.length === 0}
											<p class="px-1 py-2 text-center text-[11px] text-slate-500">{m.setup_help_no_matches?.() || 'No matches'}</p>
										{/if}
										{#each contentAvailable as sug (sug.code)}
											<button
												type="button"
												class="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-primary-500/10"
												onclick={() => addContentLanguage(sug.code)}
											>
												<span>{sug.name} ({sug.code.toUpperCase()}) <span class="text-slate-500">- {sug.native}</span></span>
												<iconify-icon icon="mdi:plus-circle-outline" width="14" class="text-primary-500" aria-hidden="true"></iconify-icon>
											</button>
										{/each}
									</div>
								</div>
							{/if}
						</div>
						<p class="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
							{m.setup_note_add_codes_default_cannot_be_removed?.() || 'Add existing or custom codes. Default cannot be removed.'}
						</p>
						{#if displayErrors.contentLanguages}
							<div class="mt-1 text-xs text-error-500" role="alert">{displayErrors.contentLanguages}</div>
						{/if}
					</div>
				</div>
			</div>
		</section>
	</div>
</div>
