<!--
@file src/routes/setup/SystemConfig.svelte
@component
**System configuration step**

Features:
- System languages
- Content languages
- Timezone
- Demo mode
- Multi-tenant mode
- Redis availability
	
-->
<script lang="ts">
	import SystemTooltip from '@components/system/SystemTooltip.svelte';
	import * as m from '@src/paraglide/messages';
	import { locales as systemLocales } from '@src/paraglide/runtime';
	//  Import types from the store
	import type { ValidationErrors } from '@stores/setupStore.svelte.ts';
	import { systemSettingsSchema } from '@utils/formSchemas';
	import iso6391 from '@utils/iso639-1.json';
	import { getLanguageName } from '@utils/languageUtils';
	import { safeParse } from 'valibot';
	import { PRESETS } from './presets';

	const presets = PRESETS;

	// --- PROPS ---
	// Added $bindable() to systemSettings
	let { systemSettings = $bindable(), validationErrors, redisAvailable = $bindable() } = $props(); // Now uses imported type

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
		if (code === systemSettings.defaultSystemLanguage && systemSettings.systemLanguages.length === 1) { return; }
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
		if (!availableLanguages.includes(c)) { return; }
		if (!systemSettings.systemLanguages.includes(c)) {
			systemSettings.systemLanguages = [...systemSettings.systemLanguages, c];
			if (!systemSettings.defaultSystemLanguage) { systemSettings.defaultSystemLanguage = c; }
		}
		closeSystemPicker();
	}
	$effect(() => {
		if (!showSystemPicker) { return; }
		const handler = (e: MouseEvent) => {
			const el = document.getElementById('system-lang-picker');
			if (el && !el.contains(e.target as Node)) { closeSystemPicker(); }
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	});
	function onSystemPickerKey(e: KeyboardEvent) {
		if (e.key === 'Escape') { closeSystemPicker(); }
	}

	// Content languages
	function removeContentLang(code: string) {
		if (code === systemSettings.defaultContentLanguage && systemSettings.contentLanguages.length === 1) { return; }
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
		if (!c || c.length < 2) { return; }
		if (!systemSettings.contentLanguages.includes(c)) {
			systemSettings.contentLanguages = [...systemSettings.contentLanguages, c];
			if (!systemSettings.defaultContentLanguage) { systemSettings.defaultContentLanguage = c; }
		}
		closeSystemPicker();
	}
	$effect(() => {
		if (!showContentPicker) { return; }
		const handler = (e: MouseEvent) => {
			const el = document.getElementById('content-lang-picker');
			if (el && !el.contains(e.target as Node)) { closeContentPicker(); }
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	});
	function onContentPickerKey(e: KeyboardEvent) {
		if (e.key === 'Escape') { closeContentPicker(); }
		if (e.key === 'Enter') {
			e.preventDefault();
			addContentLanguage(contentPickerSearch.trim());
		}
	}

	$effect(() => {
		// Auto-detect timezone if set to default UTC
		if (systemSettings.timezone === 'UTC') {
			try {
				const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
				if (detected && Intl.supportedValuesOf('timeZone').includes(detected)) {
					systemSettings.timezone = detected;
				}
			} catch (e) {
				// Fallback to UTC if detection fails
				console.warn('Timezone detection failed', e);
			}
		}
	});

	// Enforce dependency: Demo Mode REQUIRES Multi-Tenant
	$effect(() => {
		if (systemSettings.demoMode) {
			systemSettings.multiTenant = true;
		}
	});

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

<form onsubmit={(e) => e.preventDefault()} class="fade-in">
	<div class="mb-8">
		<p class="text-sm text-center text-tertiary-500 dark:text-primary-500 sm:text-base">{m.setup_system_intro()}</p>
	</div>

	<div class="space-y-2">
		{#if redisAvailable && !systemSettings.useRedis}
			<div class="rounded-lg bg-surface-500 p-4 text-white shadow-lg animate-in fade-in slide-in-from-top-4 duration-500" role="alert">
				<div class="flex items-start gap-4">
					<iconify-icon icon="mdi:lightning-bolt" class="bg-error-500 p-2 text-white rounded-full text-2xl animate-pulse"></iconify-icon>
					<div class="flex-1">
						<div class="flex items-center justify-between">
							<h4 class="font-bold text-lg flex items-center gap-4">
								Performance Optimization Detected
								<span class="badge preset-filled-error-500 rounded-full uppercase">Recommended</span>
							</h4>
							<!-- Close button -->
							<button
								type="button"
								class="btn-icon rounded-full preset-outlined"
								onclick={() => (redisAvailable = false)}
								aria-label="Dismiss recommendation"
							>
								<iconify-icon icon="mdi:close" width="20"></iconify-icon>
							</button>
						</div>
						<p class="mt-1 text-sm leading-relaxed italic">
							A local Redis server was detected on this system. <br>Enabling Redis caching can speed up data access by up to <strong>50x</strong>
							by reducing database load.
						</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- Solution Presets -->
		<section class="mb-8 space-y-4">
			<div class="flex items-center gap-2">
				<iconify-icon icon="mdi:package-variant-closed" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				<h3 class="text-lg font-semibold text-black dark:text-white">Solution Preset</h3>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				{#each presets as preset (preset.id)}
					<button
						type="button"
						class="relative flex flex-col items-start p-4 rounded-lg border-2 text-left transition-all duration-200
						{systemSettings.preset === preset.id
							? 'border-tertiary-500 bg-tertiary-50/50 dark:border-primary-500 dark:bg-primary-900/10'
							: 'border-slate-200 bg-white hover:border-tertiary-300 dark:border-slate-700 dark:bg-surface-800 dark:hover:border-slate-600'}"
						onclick={() => (systemSettings.preset = preset.id)}
					>
						<div class="flex w-full items-center justify-between mb-3">
							<div class="p-2 rounded bg-surface-100 dark:bg-surface-700 text-tertiary-600 dark:text-primary-400">
								<iconify-icon icon={preset.icon} width="24"></iconify-icon>
							</div>
							{#if systemSettings.preset === preset.id}
								<iconify-icon icon="mdi:check-circle" width="24" class="text-tertiary-500 dark:text-primary-500 animate-in zoom-in"></iconify-icon>
							{/if}
						</div>

						<h4 class="font-bold text-slate-800 dark:text-slate-100 mb-1">{preset.title}</h4>
						<p class="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed min-h-[40px]">{preset.description}</p>

						<div class="mt-auto flex flex-wrap gap-1">
							{#each preset.features.slice(0, 2) as feature}
								<span class="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"> {feature} </span>
							{/each}
							{#if preset.features.length > 2}
								<span class="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
									+{preset.features.length - 2}
								</span>
							{/if}
						</div>
					</button>
				{/each}
			</div>
			<p class="text-xs text-slate-500 dark:text-slate-400 italic">{m.setup_presets_helper()}</p>
		</section>

		<!-- Basic Site Settings -->
		<section>
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<!-- Site Name & Production URL Group -->
				<div class="space-y-3">
					<label for="site-name" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:web" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span class="text-black dark:text-white">{m.setup_system_site_name?.() || 'CMS Name'}</span>
						<SystemTooltip title={m.setup_help_site_name()}>
							<button
								type="button"
								tabindex="-1"
								aria-label="Help: Site Name"
								class="ml-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
							>
								<iconify-icon icon="mdi:help-circle-outline" width="16" aria-hidden="true"></iconify-icon>
							</button>
						</SystemTooltip>
					</label>

					<input
						id="site-name"
						bind:value={systemSettings.siteName}
						onblur={() => handleBlur('siteName')}
						type="text"
						placeholder={m.setup_system_site_name_placeholder?.() || 'My SveltyCMS Site'}
						class="input w-full rounded {displayErrors.siteName ? 'border-error-500' : 'border-slate-200'}"
						aria-invalid={!!displayErrors.siteName}
						aria-describedby={displayErrors.siteName ? 'site-name-error' : undefined}
					>
					{#if displayErrors.siteName}
						<div id="site-name-error" class="mt-1 text-xs text-error-500" role="alert">{displayErrors.siteName}</div>
					{/if}

					<label for="host-prod" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:earth" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span class="text-black dark:text-white">{m.setup_system_host_prod?.() || 'Production URL'}</span>
						<SystemTooltip title={m.setup_help_host_prod?.() || 'The production URL...'}>
							<button
								type="button"
								tabindex="-1"
								aria-label="Help: Production URL"
								class="ml-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
							>
								<iconify-icon icon="mdi:help-circle-outline" width="16" aria-hidden="true"></iconify-icon>
							</button>
						</SystemTooltip>
					</label>

					<input
						id="host-prod"
						bind:value={systemSettings.hostProd}
						type="url"
						onblur={() => handleBlur('hostProd')}
						placeholder={m.setup_system_host_prod_placeholder?.() || 'https://mysite.com'}
						class="input w-full rounded {displayErrors.hostProd ? 'border-error-500' : 'border-slate-200'}"
						aria-invalid={!!displayErrors.hostProd}
						aria-describedby={displayErrors.hostProd ? 'host-prod-error' : undefined}
					>
					{#if displayErrors.hostProd}
						<div id="host-prod-error" class="mt-1 text-xs text-error-500" role="alert">{displayErrors.hostProd}</div>
					{/if}

					<label for="timezone" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:clock-outline" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span class="text-black dark:text-white">{m.setup_system_timezone?.() || 'Timezone'}</span>
						<SystemTooltip title={m.setup_help_timezone?.() || 'Default system timezone'}>
							<button
								type="button"
								tabindex="-1"
								aria-label="Help: Timezone"
								class="ml-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
							>
								<iconify-icon icon="mdi:help-circle-outline" width="16" aria-hidden="true"></iconify-icon>
							</button>
						</SystemTooltip>
					</label>

					<select
						id="timezone"
						bind:value={systemSettings.timezone}
						onblur={() => handleBlur('timezone')}
						class="input w-full rounded {displayErrors.timezone ? 'border-error-500' : 'border-slate-200'}"
						aria-invalid={!!displayErrors.timezone}
						aria-describedby={displayErrors.timezone ? 'timezone-error' : undefined}
					>
						{#each Intl.supportedValuesOf('timeZone') as tz (tz)}
							<option value={tz}>{tz}</option>
						{/each}
					</select>
					{#if displayErrors.timezone}
						<div id="timezone-error" class="mt-1 text-xs text-error-500" role="alert">{displayErrors.timezone}</div>
					{/if}
				</div>

				<!-- Media Storage Configuration Group -->
				<div class="space-y-3">
					<label for="media-storage-type" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:cloud-outline" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span class="text-black dark:text-white">{m.setup_system_media_type?.() || 'Media Storage Type'}</span>
						<SystemTooltip title={m.setup_help_media_type?.() || m.setup_help_media_path()}>
							<button
								type="button"
								tabindex="-1"
								aria-label="Help: Media Storage Type"
								class="ml-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
							>
								<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
							</button>
						</SystemTooltip>
					</label>

					<select id="media-storage-type" bind:value={systemSettings.mediaStorageType} class="input w-full rounded">
						<option value="local">{m.setup_media_type_local?.() || '📁 Local Storage'}</option>
						<option value="s3">{m.setup_media_type_s3?.() || '☁️ Amazon S3'}</option>
						<option value="r2">{m.setup_media_type_r2?.() || '☁️ Cloudflare R2'}</option>
						<option value="cloudinary">{m.setup_media_type_cloudinary?.() || '☁️ Cloudinary'}</option>
					</select>

					<label for="media-folder" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:folder" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span class="text-black dark:text-white">
							{systemSettings.mediaStorageType === 'local'
								? m.setup_system_media_folder_local?.() || 'Media Folder Path'
								: m.setup_system_media_folder_cloud?.() || 'Bucket/Cloud Name'}
						</span>
						<SystemTooltip title={m.setup_help_media_type?.() || 'Storage path configuration'}>
							<button
								type="button"
								tabindex="-1"
								aria-label="Help: Media Folder"
								class="ml-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
							>
								<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
							</button>
						</SystemTooltip>
					</label>

					<input
						id="media-folder"
						bind:value={systemSettings.mediaFolder}
						type="text"
						placeholder={systemSettings.mediaStorageType === 'local'
							? m.setup_system_media_path_placeholder?.() || './mediaFolder'
							: m.setup_system_bucket_placeholder?.() || 'my-bucket-name'}
						class="input w-full rounded"
					>

					{#if systemSettings.mediaStorageType !== 'local'}
						<div class="rounded-md border border-amber-300/50 bg-amber-50/50 p-3 dark:border-amber-700/50 dark:bg-amber-900/20" role="status">
							<p class="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
								<iconify-icon icon="mdi:information-outline" width="16" aria-hidden="true"></iconify-icon>
								<strong>{m.setup_note_cloud_credentials?.() || 'Note:'}</strong>
							</p>
						</div>
					{/if}
				</div>
			</div>
		</section>

		<!-- Languages -->
		<section class="space-y-6 border-t border-slate-200 pt-6 dark:border-slate-700">
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<!-- Default System Language -->
				<div class="space-y-3 rounded border border-slate-300/50 bg-secondary-50/50 p-4 dark:border-slate-600/60 dark:bg-surface-800/40">
					<label for="default-system-lang" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:translate" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span class="text-black dark:text-white">{m.setup_label_default_system_language?.() || 'Default System Language'}</span>
						<SystemTooltip title={m.setup_help_default_system_language()}>
							<button
								tabindex="-1"
								type="button"
								aria-label="Help: Default System Language"
								class="ml-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
							>
								<iconify-icon icon="mdi:help-circle-outline" width="16" aria-hidden="true"></iconify-icon>
							</button>
						</SystemTooltip>
					</label>

					<p class="text-[10px] text-slate-500 dark:text-slate-400" id="system-lang-help">
						Select the primary language for the admin interface. This is important for screen readers.
					</p>

					<select id="default-system-lang" bind:value={systemSettings.defaultSystemLanguage} class="input w-full rounded">
						{#each systemSettings.systemLanguages as lang (lang)}
							<option value={lang}>{displayLang(lang)}</option>
						{/each}
					</select>
					<div>
						<div class="mb-1 flex items-center gap-1 text-sm font-medium tracking-wide">
							<iconify-icon icon="mdi:translate-variant" width="14" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
							<span class="text-black dark:text-white">{m.setup_label_system_languages?.() || 'System Languages'}</span>
							<SystemTooltip title={m.setup_help_system_languages()}>
								<button
									tabindex="-1"
									type="button"
									aria-label="Help: System Languages"
									class="ml-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</SystemTooltip>
						</div>

						<div
							class="relative flex min-h-[42px] flex-wrap items-center gap-2 rounded border border-slate-300/50 bg-surface-50/40 pr-16 dark:border-slate-600 dark:bg-surface-700/40"
						>
							{#each systemSettings.systemLanguages as lang (lang)}
								<span
									class="group badge preset-filled-tertiary-500 dark:preset-filled-primary-500 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-white"
								>
									<span class="text-sm font-medium">{displayLang(lang)}</span>
									{#if systemSettings.systemLanguages.length > 1}
										<button
											type="button"
											class="flex items-center justify-center -mr-1.5 p-0.5 rounded-full hover:bg-white/20 transition-colors"
											onclick={() => removeSystemLang(lang)}
											aria-label={`Remove ${displayLang(lang)}`}
										>
											<iconify-icon icon="mdi:close" width="14"></iconify-icon>
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
									>
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
				<!-- Default Content Language -->
				<div class="space-y-3 rounded-md border border-slate-300/50 bg-secondary-50/50 p-4 dark:border-slate-600/60 dark:bg-surface-800/40">
					<div class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon
							icon="mdi:book-open-page-variant"
							width="18"
							class="text-tertiary-500 dark:text-primary-500"
							aria-hidden="true"
						></iconify-icon>
						<span class="text-black dark:text-white">{m.setup_label_default_content_language?.() || 'Default Content Language'}</span>
						<SystemTooltip title={m.setup_help_default_content_language()}>
							<button
								tabindex="-1"
								type="button"
								aria-label="Help: Default Content Language"
								class="ml-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
							>
								<iconify-icon icon="mdi:help-circle-outline" width="16" aria-hidden="true"></iconify-icon>
							</button>
						</SystemTooltip>
					</div>
					<p class="text-[10px] text-slate-500 dark:text-slate-400" id="system-lang-help">Select the primary language for your content.</p>
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
							<span class="text-black dark:text-white">{m.setup_label_content_languages?.() || 'Content Languages'}</span>
							<SystemTooltip title={m.setup_help_content_languages()}>
								<button
									tabindex="-1"
									type="button"
									aria-label="Help: Content Languages"
									class="ml-1 text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
								>
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</SystemTooltip>
						</div>

						<div
							class="relative flex min-h-[42px] flex-wrap items-center gap-2 rounded border p-2 pr-16 {displayErrors.contentLanguages
								? 'border-error-500 bg-error-50 dark:bg-error-900/20'
								: 'border-slate-300/50 bg-surface-50/50 dark:border-slate-600 dark:bg-surface-700/40'}"
						>
							{#each systemSettings.contentLanguages as lang (lang)}
								<span
									class="group badge preset-filled-tertiary-500 dark:preset-filled-primary-500 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-white"
								>
									<span class="text-sm font-medium">{displayLang(lang)}</span>
									{#if lang !== systemSettings.defaultContentLanguage || systemSettings.contentLanguages.length > 1}
										<button
											type="button"
											class="flex items-center justify-center -mr-1.5 p-0.5 rounded-full hover:bg-white/20 transition-colors"
											onclick={() => removeContentLang(lang)}
											aria-label={`Remove ${displayLang(lang)}`}
										>
											<iconify-icon icon="mdi:close" width="14"></iconify-icon>
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
									>
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

		<!-- Optimization (Redis, Multi-Tenant, Demo) -->
		<section id="redis-section" class="space-y-4 border-t border-slate-200 pt-6 dark:border-slate-700">
			<div class="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-transparent space-y-4">
				<div class="flex items-center gap-3">
					<input
						id="use-redis"
						type="checkbox"
						bind:checked={systemSettings.useRedis}
						class="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
					>
					<div class="flex items-center gap-2">
						<iconify-icon icon="devicon-plain:redis" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						<label for="use-redis" class="font-medium text-black dark:text-white text-sm"> Enable Redis Caching </label>
						<SystemTooltip
							title="Significantly improves performance by caching database queries and session data in-memory. Recommended if Redis is available."
						>
							<iconify-icon
								icon="mdi:help-circle-outline"
								width="16"
								class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
							></iconify-icon>
						</SystemTooltip>
					</div>
				</div>

				{#if systemSettings.useRedis}
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-3 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
						<div class="space-y-1.5">
							<label for="redis-host" class="text-xs font-semibold text-slate-500 dark:text-slate-400">Redis Host</label>
							<input id="redis-host" bind:value={systemSettings.redisHost} type="text" placeholder="localhost" class="input text-sm py-1.5 rounded">
						</div>
						<div class="space-y-1.5">
							<label for="redis-port" class="text-xs font-semibold text-slate-500 dark:text-slate-400">Redis Port</label>
							<input id="redis-port" bind:value={systemSettings.redisPort} type="text" placeholder="6379" class="input text-sm py-1.5 rounded">
						</div>
						<div class="space-y-1.5">
							<label for="redis-password" class="text-xs font-semibold text-slate-500 dark:text-slate-400">Redis Password (Optional)</label>
							<input
								id="redis-password"
								bind:value={systemSettings.redisPassword}
								type="password"
								placeholder="••••••••"
								class="input text-sm py-1.5 rounded"
							>
						</div>
					</div>
				{/if}
			</div>
		</section>

		<!-- System Infrastructure / Mode -->
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<!-- Multi-Tenant Toggle -->
			<div class="input flex items-center gap-3 rounded border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-transparent">
				<input
					id="multi-tenant-mode"
					type="checkbox"
					bind:checked={systemSettings.multiTenant}
					class="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
				>
				<div class="flex items-center gap-2">
					<iconify-icon icon="mdi:domain" width="18" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
					<label for="multi-tenant-mode" class="font-medium text-black dark:text-white">
						{m.setup_system_multi_tenant?.() || 'Multi-Tenant Mode'}
					</label>
					<SystemTooltip title={m.setup_system_multi_tenant_desc?.() || 'Enables support for multiple isolated tenants...'}>
						<iconify-icon
							icon="mdi:help-circle-outline"
							width="16"
							class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
						></iconify-icon>
					</SystemTooltip>
				</div>
			</div>

			<!-- Demo Mode Toggle -->
			<div class="input flex items-center gap-3 rounded border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-transparent">
				<input
					id="demo-mode"
					type="checkbox"
					bind:checked={systemSettings.demoMode}
					class="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
				>
				<div class="flex items-center gap-2">
					<iconify-icon icon="mdi:test-tube" width="18" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
					<label for="demo-mode" class="font-medium text-black dark:text-white"> {m.setup_system_demo_mode?.() || 'Demo Mode'} </label>
					<SystemTooltip
						title={(m.setup_system_demo_mode_desc?.() || 'Warning: Creates ephemeral environments for visitors.').replace(/<\/?[^>]+(>|$)/g, '')}
					>
						<iconify-icon
							icon="mdi:help-circle-outline"
							width="16"
							class="text-slate-400 hover:text-tertiary-500 hover:dark:text-primary-500"
						></iconify-icon>
					</SystemTooltip>
					{#if systemSettings.demoMode && !systemSettings.multiTenant}
						<span class="text-xs font-bold text-amber-600 dark:text-amber-400">
							({m.setup_note_demo_requires_multitenant?.() || 'Enables Multi-Tenant'})
						</span>
					{/if}
				</div>
			</div>
		</div>
	</div>
</form>
