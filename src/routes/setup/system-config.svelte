<!--
@file src/routes/setup/SystemConfig.svelte
@component
**System configuration step**

Features:
- Project Blueprint selection
- Basic site settings (Site Name, Prod URL, Timezone)
- Media storage configuration
- Language preferences
- Performance & Mode toggles

-->
<script lang="ts">
	import Alert from '@components/ui/alert.svelte';
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
	import Autocomplete from '@src/components/autocomplete.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	// Paraglide Messages
	import {
		button_add,
		setup_help_content_languages,
		setup_help_default_content_language,
		setup_help_default_system_language,
		setup_help_host_prod,
		setup_help_media_path,
		setup_help_media_type,
		setup_help_no_matches,
		setup_help_site_name,
		setup_help_system_languages,
		setup_help_timezone,
		setup_label_content_languages,
		setup_label_default_content_language,
		setup_label_default_system_language,
		setup_label_system_languages,
		setup_media_type_cloudinary,
		setup_media_type_local,
		setup_media_type_r2,
		setup_media_type_s3,
		setup_note_cloud_credentials,
		setup_note_demo_requires_multitenant,
		setup_system_bucket_placeholder,
		setup_system_demo_mode,
		setup_system_demo_mode_desc,
		setup_system_host_prod,
		setup_system_host_prod_placeholder,
		setup_system_infrastructure_mode,
		setup_system_intro,
		setup_system_media_folder_cloud,
		setup_system_media_folder_local,
		setup_system_media_path_placeholder,
		setup_system_media_type,
		setup_system_multi_tenant,
		setup_system_multi_tenant_desc,
		setup_system_site_name,
		setup_system_site_name_placeholder,
		setup_system_timezone,
		setup_db_test_redis_button,
		setup_db_test_redis_success
	} from '@src/paraglide/messages';
	import { locales as systemLocales } from '@src/paraglide/runtime';
	//  Import types from the store
	import type { ValidationErrors } from '@src/stores/setup-store.svelte.ts';
	import { setupStore } from '@src/stores/setup-store.svelte.ts';
	import { systemSettingsSchema } from '@utils/schemas';
	import iso6391 from '@utils/iso639-1.json';
	import { getLanguageName } from '@utils/language-utils';
	import { safeParse } from 'valibot';
	// Components
	import PresetSelector from './preset-selector.svelte';
	import { PRESETS } from './presets';

	const presets = PRESETS;

	// --- PROPS ---
	let { systemSettings = $bindable(), validationErrors, redisAvailable } = $props();

	const availableLanguages: string[] = [...systemLocales];

	import { SvelteSet } from 'svelte/reactivity';

	// Real-time validation state
	let localValidationErrors = $state<Record<string, string>>({});
	let touchedFields = $state(new SvelteSet<string>());

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
		if (code === systemSettings.defaultSystemLanguage && systemSettings.systemLanguages.length === 1) {
			return;
		}
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
		if (!availableLanguages.includes(c)) {
			return;
		}
		if (!systemSettings.systemLanguages.includes(c)) {
			systemSettings.systemLanguages = [...systemSettings.systemLanguages, c];
			if (!systemSettings.defaultSystemLanguage) {
				systemSettings.defaultSystemLanguage = c;
			}
		}
		closeSystemPicker();
	}
	$effect(() => {
		if (!showSystemPicker) {
			return;
		}
		const handler = (e: MouseEvent) => {
			const el = document.getElementById('system-lang-picker');
			if (el && !el.contains(e.target as Node)) {
				closeSystemPicker();
			}
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	});
	function onSystemPickerKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			closeSystemPicker();
		}
	}

	// Content languages
	function removeContentLang(code: string) {
		if (code === systemSettings.defaultContentLanguage && systemSettings.contentLanguages.length === 1) {
			return;
		}
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
		if (!c || c.length < 2) {
			return;
		}
		if (!systemSettings.contentLanguages.includes(c)) {
			systemSettings.contentLanguages = [...systemSettings.contentLanguages, c];
			if (!systemSettings.defaultContentLanguage) {
				systemSettings.defaultContentLanguage = c;
			}
		}
		closeSystemPicker();
	}
	$effect(() => {
		if (!showContentPicker) {
			return;
		}
		const handler = (e: MouseEvent) => {
			const el = document.getElementById('content-lang-picker');
			if (el && !el.contains(e.target as Node)) {
				closeContentPicker();
			}
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	});
	function onContentPickerKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			closeContentPicker();
		}
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
				logger.warn('Timezone detection failed', e);
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

	// Options for Autocomplete
	const allTimezones = Intl.supportedValuesOf('timeZone');
	let showScaling = $state(false);

	const mediaStorageOptions = $derived([
		{ value: 'local', label: setup_media_type_local?.() || '📁 Local Storage' },
		{ value: 's3', label: setup_media_type_s3?.() || '☁️ Amazon S3' },
		{ value: 'r2', label: setup_media_type_r2?.() || '☁️ Cloudflare R2' },
		{ value: 'cloudinary', label: setup_media_type_cloudinary?.() || '☁️ Cloudinary' }
	]);

	const systemLanguageOptions = $derived(
		systemSettings.systemLanguages.map((lang: string) => ({
			value: lang,
			label: displayLang(lang)
		}))
	);

	const contentLanguageOptions = $derived(
		systemSettings.contentLanguages.map((lang: string) => ({
			value: lang,
			label: displayLang(lang)
		}))
	);

	const cfPurgeOptions = [
		{ value: 'tags', label: 'Surgical (Tag-based - Recommended)' },
		{ value: 'all', label: 'Full Purge (Everything)' }
	];
</script>

<form onsubmit={(e) => e.preventDefault()} class="fade-in w-full min-w-0">
	<div class="mb-6">
		<p class="text-sm text-center text-tertiary-500 dark:text-primary-500 sm:text-base">{setup_system_intro()}</p>
	</div>

	<div class="space-y-2">
		{#if redisAvailable && !systemSettings.useRedis}
			<Alert variant="warning" title="Performance Optimization Detected" class="animate-in fade-in slide-in-from-top-4 duration-500">
				<div class="flex items-center justify-between gap-4">
					<div class="flex items-center gap-2">
						<Badge variant="error" class="uppercase">Recommended</Badge>
					</div>
					<Button
						variant="outline"
						type="button"
						onclick={() => (redisAvailable = false)}
						aria-label="Dismiss recommendation"
						class="p-0! min-w-0 rounded-full preset-outlined shrink-0"
					>
						<iconify-icon icon="mdi:close" width="20"></iconify-icon>
					</Button>
				</div>
				<p class="mt-1 text-sm leading-relaxed italic">
					A local Redis server was detected on this system. <br />Enabling Redis caching can speed up data access by up to <strong>50x</strong>
					by reducing database load.
				</p>
			</Alert>
		{/if}

		<!-- Project Blueprint -->
		<section class="mb-2"><PresetSelector {presets} bind:selected={systemSettings.preset} /></section>

		<!-- Basic Site Settings -->
		<section class="space-y-4">
			<div class="grid grid-cols-1 gap-4 md:grid-cols-3 items-start">
				<!-- Site Name -->
				<div class="flex flex-col gap-1">
					<label for="site-name" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:web" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span class="text-black dark:text-white">{setup_system_site_name?.() || 'CMS Name'}</span>
						<SystemTooltip title={setup_help_site_name()}>
							<button type="button" tabindex="-1" aria-label="Help: Site Name" class="ms-1 text-slate-400 hover:text-tertiary-500">
								<iconify-icon icon="mdi:help-circle-outline" width="16" aria-hidden="true"></iconify-icon>
							</button>
						</SystemTooltip>
					</label>

					<Input
						id="site-name"
						bind:value={systemSettings.siteName}
						onblur={() => handleBlur('siteName')}
						type="text"
						data-1p-ignore
						placeholder={setup_system_site_name_placeholder?.() || 'My SveltyCMS Site'}
						error={displayErrors.siteName}
					/>
				</div>

				<!-- Production URL -->
				<div class="flex flex-col gap-1">
					<label for="host-prod" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:earth" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span class="text-black dark:text-white">{setup_system_host_prod?.() || 'Production URL'}</span>
						<SystemTooltip title={setup_help_host_prod?.() || 'The production URL...'}>
							<button type="button" tabindex="-1" aria-label="Help: Production URL" class="ms-1 text-slate-400 hover:text-tertiary-500">
								<iconify-icon icon="mdi:help-circle-outline" width="16" aria-hidden="true"></iconify-icon>
							</button>
						</SystemTooltip>
					</label>

					<Input
						id="host-prod"
						bind:value={systemSettings.hostProd}
						type="url"
						data-1p-ignore
						onblur={() => handleBlur('hostProd')}
						placeholder={setup_system_host_prod_placeholder?.() || 'https://mysite.com'}
						error={displayErrors.hostProd}
					/>
				</div>

				<!-- Timezone (Enhanced with Autocomplete) -->
				<div class="flex flex-col gap-1">
					<label for="timezone" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:clock-outline" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span class="text-black dark:text-white">{setup_system_timezone?.() || 'Timezone'}</span>
						<SystemTooltip title={setup_help_timezone?.() || 'Default system timezone'}>
							<button type="button" tabindex="-1" aria-label="Help: Timezone" class="ms-1 text-slate-400 hover:text-tertiary-500">
								<iconify-icon icon="mdi:help-circle-outline" width="16" aria-hidden="true"></iconify-icon>
							</button>
						</SystemTooltip>
					</label>

					<Autocomplete
						options={allTimezones}
						bind:value={systemSettings.timezone}
						placeholder="Search timezone..."
						onSelect={() => handleBlur('timezone')}
						className="w-full rounded border border-slate-300 dark:border-surface-600  "
					/>
					{#if displayErrors.timezone}
						<div id="timezone-error" class="mt-1 text-xs text-error-500" role="alert">{displayErrors.timezone}</div>
					{/if}
				</div>

				<!-- Password Minimum Length -->
				<!-- Min Password Length moved to system settings page -->
				<div class="hidden">
					<input
												id="password-min-length"
												bind:value={systemSettings.passwordMinLength}
												type="number"
												aria-label="password-min-length"
											/>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 items-start pt-1">
				<!-- Media Storage Configuration -->
				<div class="space-y-2">
					<label for="media-storage-type" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:cloud-outline" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span class="text-black dark:text-white">{setup_system_media_type?.() || 'Media Storage Type'}</span>
						<SystemTooltip title={setup_help_media_type?.() || setup_help_media_path()}>
							<button type="button" tabindex="-1" aria-label="Help: Media Storage Type" class="ms-1 text-slate-400 hover:text-tertiary-500">
								<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
							</button>
						</SystemTooltip>
					</label>

					<Select bind:value={systemSettings.mediaStorageType} options={mediaStorageOptions} placeholder="Select storage type..." />
				</div>

				<!-- Media Folder Path -->
				<div class="space-y-2">
					<label for="media-folder" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:folder" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span class="text-black dark:text-white">
							{systemSettings.mediaStorageType === 'local'
								? setup_system_media_folder_local?.() || 'Media Folder Path'
								: setup_system_media_folder_cloud?.() || 'Bucket/Cloud Name'}
						</span>
						<SystemTooltip title={setup_help_media_type?.() || 'Storage path configuration'}>
							<button type="button" tabindex="-1" aria-label="Help: Media Folder" class="ms-1 text-slate-400 hover:text-tertiary-500">
								<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
							</button>
						</SystemTooltip>
					</label>

					<Input
						id="media-folder"
						bind:value={systemSettings.mediaFolder}
						type="text"
						data-1p-ignore
						placeholder={systemSettings.mediaStorageType === 'local'
							? setup_system_media_path_placeholder?.() || './mediaFolder'
							: setup_system_bucket_placeholder?.() || 'my-bucket-name'}
					/>

					{#if systemSettings.mediaStorageType !== 'local'}
						<div class="rounded border border-amber-300/50 bg-amber-50/50 p-3 dark:border-amber-700/50 dark:bg-amber-900/20" role="status">
							<p class="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
								<iconify-icon icon="mdi:information-outline" width="16" aria-hidden="true"></iconify-icon>
								<strong>{setup_note_cloud_credentials?.() || 'Note:'}</strong>
							</p>
						</div>
					{/if}
				</div>
			</div>
		</section>

		<!-- Languages -->
		<section class="space-y-5 border-t border-surface-200 dark:border-white/10 pt-2">
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<!-- Default System Language -->
				<div class="space-y-2 rounded border border-surface-200 dark:border-white/5 p-4">
					<label for="default-system-lang" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:translate" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
						<span class="text-black dark:text-white">{setup_label_default_system_language?.() || 'Default System Language'}</span>
						<SystemTooltip title={setup_help_default_system_language()}>
							<button tabindex="-1" type="button" aria-label="Help: Default System Language" class="ms-1 text-slate-400 hover:text-tertiary-500">
								<iconify-icon icon="mdi:help-circle-outline" width="16" aria-hidden="true"></iconify-icon>
							</button>
						</SystemTooltip>
					</label>

					<p class="text-[10px] text-slate-500 dark:text-white/40" id="system-lang-help">Select the primary language for the admin interface.</p>

					<Select
						bind:value={systemSettings.defaultSystemLanguage}
						options={systemLanguageOptions}
						placeholder="Select system language..."
					/>
					<div>
						<div class="mb-1 flex items-center gap-1 text-sm font-medium tracking-wide">
							<iconify-icon icon="mdi:translate-variant" width="14" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
							<span class="text-black dark:text-white">{setup_label_system_languages?.() || 'System Languages'}</span>
							<SystemTooltip title={setup_help_system_languages()}>
								<button tabindex="-1" type="button" aria-label="Help: System Languages" class="ms-1 text-slate-400 hover:text-tertiary-500">
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</SystemTooltip>
						</div>

						<div class="relative flex min-h-10.5 flex-wrap items-center gap-2 rounded border border-surface-200 dark:border-white/5 p-2 pe-16">
							{#each systemSettings.systemLanguages as lang (lang)}
								<span
									class="group badge preset-filled-tertiary-500 dark:preset-filled-primary-500 inline-flex items-center gap-2 rounded-full px-3 py-1 text-white"
								>
									<span class="text-xs font-medium">{displayLang(lang)}</span>
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
								<Button variant="surface"
									type="button"
									onclick={openSystemPicker}
																		aria-label="add-system-language"
																		aria-haspopup="dialog"
									aria-expanded={showSystemPicker}
									aria-controls="system-lang-picker"
								 class="badge absolute inset-e-2 top-1/2 -translate-y-1/2 rounded-full">
									<iconify-icon icon="mdi:plus" width="14" aria-hidden="true"></iconify-icon>
									{button_add?.() || 'Add'}
								</Button>
							{/if}
							{#if showSystemPicker}
								<div
									id="system-lang-picker"
									class="absolute inset-s-0 top-full z-20 mt-2 w-64 rounded border border-surface-200 dark:border-white/10 bg-white dark:bg-surface-800 p-2 shadow-xl"
									role="dialog"
									aria-label="Add system language"
									tabindex="-1"
									onkeydown={onSystemPickerKey}
								>
									<Input
										id="system-lang-search"
										aria-label="search-system-languages"
										placeholder="Search..."
										bind:value={systemPickerSearch}
										inputClass="text-xs py-1"
										class="mb-2"
									/>
									<div class="max-h-48 overflow-auto">
										{#if systemAvailable.length === 0}
											<p class="px-1 py-2 text-center text-[11px] text-slate-400 dark:text-white/40">{setup_help_no_matches?.() || 'No matches'}</p>
										{/if}
										{#each systemAvailable as sug (sug)}
											<button
												type="button"
												class="flex w-full items-center justify-between rounded px-2 py-1 text-start text-xs hover:bg-tertiary-500/10 dark:hover:bg-tertiary-500 dark:bg-primary-500/10"
												onclick={() => addSystemLanguage(sug)}
											>
												<span class="text-black dark:text-white">{displayLang(sug)}</span>
										aria-label="add-language-{displayLang(sug)}"
												<iconify-icon icon="mdi:plus-circle-outline" width="14" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"
												></iconify-icon>
											</button>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</div>
				</div>
				<!-- Default Content Language -->
				<div class="space-y-2 rounded border border-surface-200 dark:border-white/5 p-4">
					<div class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon icon="mdi:book-open-page-variant" width="18" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"
						></iconify-icon>
						<span class="text-black dark:text-white">{setup_label_default_content_language?.() || 'Default Content Language'}</span>
						<SystemTooltip title={setup_help_default_content_language()}>
							<button tabindex="-1" type="button" aria-label="Help: Default Content Language" class="ms-1 text-slate-400 hover:text-tertiary-500">
								<iconify-icon icon="mdi:help-circle-outline" width="16" aria-hidden="true"></iconify-icon>
							</button>
						</SystemTooltip>
					</div>
					<p class="text-[10px] text-slate-500 dark:text-white/40" id="system-lang-help">Select the primary language for your content.</p>
					<Select
						bind:value={systemSettings.defaultContentLanguage}
						options={contentLanguageOptions}
						placeholder="Select content language..."
						error={displayErrors.defaultContentLanguage}
						onchange={() => handleBlur('defaultContentLanguage')}
					/>
					<div>
						<div class="mb-1 flex items-center gap-1 text-sm font-medium tracking-wide">
							<iconify-icon icon="mdi:book-multiple" width="14" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
							<span class="text-black dark:text-white">{setup_label_content_languages?.() || 'Content Languages'}</span>
							<SystemTooltip title={setup_help_content_languages()}>
								<button tabindex="-1" type="button" aria-label="Help: Content Languages" class="ms-1 text-slate-400 hover:text-tertiary-500">
									<iconify-icon icon="mdi:help-circle-outline" width="14" aria-hidden="true"></iconify-icon>
								</button>
							</SystemTooltip>
						</div>

						<div
							class="relative flex min-h-10.5 flex-wrap items-center gap-2 rounded border p-2 pe-16 {displayErrors.contentLanguages
								? 'border-error-500 bg-error-50 dark:bg-error-900/20'
								: 'border-surface-200 dark:border-white/5 '}"
						>
							{#each systemSettings.contentLanguages as lang (lang)}
								<span
									class="group badge preset-filled-tertiary-500 dark:preset-filled-primary-500 inline-flex items-center gap-2 rounded-full px-3 py-1 text-white"
								>
									<span class="text-xs font-medium">{displayLang(lang)}</span>
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
							<Button variant="surface"
								type="button"
								onclick={openContentPicker}
							aria-label="add-content-language"
								aria-haspopup="dialog"
								aria-expanded={showContentPicker}
								aria-controls="content-lang-picker"
							 class="badge absolute inset-e-2 top-1/2 -translate-y-1/2 rounded-full">
								<iconify-icon icon="mdi:plus" width="14" aria-hidden="true"></iconify-icon>
								{button_add?.() || 'Add'}
							</Button>
							{#if showContentPicker}
								<div
									id="content-lang-picker"
									class="absolute inset-s-0 top-full z-20 mt-2 w-64 rounded border border-white/10 bg-surface-800 p-2 shadow-xl"
									role="dialog"
									aria-label="Add content language"
									tabindex="-1"
									onkeydown={onContentPickerKey}
								>
									<Input
										id="content-lang-search"
										aria-label="search-content-languages"
										placeholder="Search languages..."
										bind:value={contentPickerSearch}
										inputClass="text-xs py-1"
										class="mb-2"
									/>
									<div class="max-h-48 overflow-auto">
										{#if contentAvailable.length === 0}
											<p class="px-1 py-2 text-center text-[11px] text-white/40">{setup_help_no_matches?.() || 'No matches'}</p>
										{/if}
										{#each contentAvailable as sug (sug.code)}
											<button
												type="button"
												class="flex w-full items-center justify-between rounded px-2 py-1 text-start text-xs hover:bg-tertiary-500/10 dark:hover:bg-tertiary-500 dark:bg-primary-500/10"
												onclick={() => addContentLanguage(sug.code)}
										aria-label="add-content-language-{sug.name}"
											>
												<span class="text-black dark:text-white"
													>{sug.name} ({sug.code.toUpperCase()}) <span class="text-slate-500 dark:text-white/40">- {sug.native}</span></span
												>
												<iconify-icon icon="mdi:plus-circle-outline" width="14" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"
												></iconify-icon>
											</button>
										{/each}
									</div>
								</div>
							{/if}
						</div>
						{#if displayErrors.contentLanguages}
							<div class="mt-1 text-xs text-error-500" role="alert">{displayErrors.contentLanguages}</div>
						{/if}
					</div>
				</div>
			</div>
		</section>

		<!-- System Infrastructure / Mode -->
		<section id="infrastructure-section" class="mt-4 border-t border-surface-200 dark:border-white/10 pt-4">
			<h4 class="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-primary-500 mb-4">
				<iconify-icon icon="mdi:server-network" width="18"></iconify-icon>
				{setup_system_infrastructure_mode?.() || 'System Infrastructure / Mode'}
			</h4>

			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<!-- Multi-Tenant Toggle -->
				<Checkbox
					bind:checked={systemSettings.multiTenant}
					label={setup_system_multi_tenant?.() || 'Multi-Tenant Mode'}
					description={setup_system_multi_tenant_desc?.() || 'Enables support for multiple isolated tenants...'}
					variant="card"
				/>

				<!-- Demo Mode Toggle -->
				<div class="space-y-2">
					<Checkbox
						bind:checked={systemSettings.demoMode}
						label={setup_system_demo_mode?.() || 'Demo Mode'}
						description={(setup_system_demo_mode_desc?.() || 'Warning: Creates ephemeral environments for visitors.').replace(/<\/?[^>]+(>|$)/g, '')}
						variant="card"
					/>
					{#if systemSettings.demoMode && !systemSettings.multiTenant}
						<span class="text-xs font-bold text-amber-600 dark:text-amber-400">
							({setup_note_demo_requires_multitenant?.() || 'Enables Multi-Tenant'})
						</span>
					{/if}
				</div>
			</div>
		</section>


		<!-- Optimization (Redis, Multi-Tenant, Demo) -->
		<section id="redis-section" class="space-y-2 border-t border-surface-200 dark:border-white/10 pt-2">
			<div class="rounded border border-surface-200 dark:border-white/5 p-3 space-y-4">
				<Checkbox
					bind:checked={systemSettings.useRedis}
					label="Enable Redis Caching"
					description="Significantly improves performance by caching database queries and session data in-memory. Recommended if Redis is available."
					variant="card"
				/>
				{#if systemSettings.useRedis}
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-3 animate-in fade-in slide-in-from-top-2 duration-300 mt-4">
						<Input
							id="redis-host"
							bind:value={systemSettings.redisHost}
							type="text"
							data-1p-ignore
							label="Redis Host"
							placeholder="localhost"
						/>
						<Input
							id="redis-port"
							bind:value={systemSettings.redisPort}
							type="text"
							data-1p-ignore
							label="Redis Port"
							placeholder="6379"
						/>
						<Input
							id="redis-password"
							bind:value={systemSettings.redisPassword}
							type="password"
							data-1p-ignore
							label="Redis Password (Optional)"
							placeholder="••••••••"
						/>
					</div>

					<div class="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-surface-100 dark:border-white/5 pt-4">
						<Button variant="tertiary"
							type="button"
							onclick={setupStore.testRedisConnection}
						aria-label="test-redis-connection"
							disabled={setupStore.wizard.isLoading}
						 class="dark: rounded flex items-center gap-2">
							{#if setupStore.wizard.isLoading}
								<iconify-icon icon="line-md:loading-twotone-loop" width="20"></iconify-icon>
							{:else}
								<iconify-icon icon="mdi:connection" width="20"></iconify-icon>
							{/if}
							{setup_db_test_redis_button?.() || 'Test Redis Connection'}
						</Button>

						{#if setupStore.wizard.redisTestPassed}
							<div class="flex items-center gap-2 text-tertiary-500 dark:text-primary-500 text-sm font-medium animate-in fade-in zoom-in duration-300">
								<iconify-icon icon="mdi:check-circle" width="20"></iconify-icon>
								<span>{setup_db_test_redis_success?.() || 'Connected successfully!'}</span>
							</div>
						{:else if setupStore.wizard.errorMessage && !setupStore.wizard.redisTestPassed}
							<div class="flex items-center gap-2 text-error-600 dark:text-error-500 text-sm font-medium animate-in fade-in slide-in-from-left-2 duration-300">
								<iconify-icon icon="mdi:alert-circle" width="20"></iconify-icon>
								<span>{setupStore.wizard.errorMessage}</span>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</section>

		<!-- Enterprise Scaling & performance -->
		<div class="mt-4 border-t border-surface-200 dark:border-white/10 pt-4">
			<button
				type="button"
				class="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-primary-500 hover:text-tertiary-500 transition-colors"
				onclick={() => (showScaling = !showScaling)}
			>
				<iconify-icon icon={showScaling ? 'mdi:cloud-sync' : 'mdi:cloud-cog'} width="18"></iconify-icon>
			aria-label="toggle-enterprise-scaling"
				Advanced: Enterprise Scaling (Cloudflare CDN)
			</button>

			{#if showScaling}
				<div class="mt-4 space-y-4 rounded border border-surface-200 dark:border-white/10 p-4 transition-all duration-300">
					<p class="text-xs text-slate-500 dark:text-white/40">
						Configure native CDN purging to synchronize global edge nodes instantly upon content updates.
					</p>

					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<Input
							id="cf-token"
							bind:value={systemSettings.cfApiToken}
							type="password"
							label="Cloudflare API Token"
							labelClass="text-xs font-bold uppercase tracking-wider text-slate-400"
							placeholder="Enter API Token"
						/>
						<Input
							id="cf-zone"
							bind:value={systemSettings.cfZoneId}
							type="text"
							label="Cloudflare Zone ID"
							labelClass="text-xs font-bold uppercase tracking-wider text-slate-400"
							placeholder="Enter Zone ID"
						/>
					</div>

					<div class="space-y-1">
						<Select
							bind:value={systemSettings.cfPurgeMode}
							label="Purge Strategy"
							options={cfPurgeOptions}
							placeholder="Select purge strategy..."
							size="sm"
						/>
						<p class="text-[10px] text-amber-500 italic mt-1">
							* Surgical purging requires a Cloudflare Enterprise plan or specific Cache Tag support.
						</p>
					</div>
				</div>
			{/if}
		</div>


	</div>
</form>
