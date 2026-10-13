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
	import HelpIcon from '@components/ui/help-icon.svelte';
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';
	import Dropdown from '@components/ui/dropdown.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { untrack } from 'svelte';
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
		setup_search_placeholder,
		setup_system_site_name,
		setup_system_site_name_placeholder,
		setup_system_timezone,
		setup_badge_rtl,
		setup_badge_translated,
		setup_badge_english_ui,
		setup_system_lang_primary_help,
		setup_content_lang_primary_help,
		setup_search_languages,
		setup_select_system_language,
		setup_select_content_language,
		setup_select_timezone,
		setup_aria_add_system_language,
		setup_aria_add_content_language,
		setup_aria_search_system_languages,
		setup_aria_search_content_languages,
		setup_help_site_name_aria,
		setup_help_host_prod_aria,
		setup_help_timezone_aria,
		setup_help_default_system_language_aria,
		setup_help_system_languages_aria,
		setup_help_default_content_language_aria,
		setup_help_content_languages_aria,
		setup_note_machine_translate
	} from '@src/paraglide/messages';
	//  Import types from the store
	import type { ValidationErrors } from '@src/stores/setup-store.svelte.ts';
	import { systemSettingsSchema } from '@utils/schemas';
	import iso6391 from '@utils/iso639-1.json';
	import { getLanguageName } from '@utils/language-utils';
	import { getTextDirection } from '@utils/string';
	import {
		isCompiledSystemLocale,
		isIso6391LanguageCode,
		languageBase
	} from '@utils/system-locale';
	import { logger } from '@utils/logger';
	import { safeParse } from 'valibot';

	// --- PROPS ---
	let { systemSettings = $bindable(), validationErrors } = $props();

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
		if (
			code === systemSettings.defaultSystemLanguage &&
			systemSettings.systemLanguages.length === 1
		) {
			return;
		}
		systemSettings.systemLanguages = systemSettings.systemLanguages.filter(
			(c: string) => c !== code
		);
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
		const c = languageBase(code);
		if (!isIso6391LanguageCode(c)) {
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
		if (e.key === 'Enter') {
			e.preventDefault();
			addSystemLanguage(systemPickerSearch.trim());
		}
	}

	// Content languages
	function removeContentLang(code: string) {
		if (
			code === systemSettings.defaultContentLanguage &&
			systemSettings.contentLanguages.length === 1
		) {
			return;
		}
		systemSettings.contentLanguages = systemSettings.contentLanguages.filter(
			(c: string) => c !== code
		);
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
		closeContentPicker();
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

	// Enforce dependency: Demo Mode REQUIRES Multi-Tenant.
	// Use an untracked write to avoid a reactive feedback loop that causes
	// layout thrashing on mobile when the Multi-Tenant checkbox is manually
	// toggled while Demo Mode is already enabled.
	$effect(() => {
		const shouldForce = systemSettings.demoMode && !systemSettings.multiTenant;
		if (shouldForce) {
			// Only set when multiTenant is false - don't fight user toggles
			untrack(() => {
				systemSettings.multiTenant = true;
			});
		}
	});

	// Derived available suggestions
	let systemAvailable = $state<{ code: string; name: string; native: string }[]>([]);
	let contentAvailable = $state<{ code: string; name: string; native: string }[]>([]);
	$effect(() => {
		const systemSearch = systemPickerSearch.toLowerCase();
		systemAvailable = iso6391
			.filter(
				(lang) =>
					!systemSettings.systemLanguages.includes(lang.code) &&
					(lang.code.toLowerCase().includes(systemSearch) ||
						lang.name.toLowerCase().includes(systemSearch) ||
						lang.native.toLowerCase().includes(systemSearch))
			)
			.sort(
				(a, b) =>
					Number(isCompiledSystemLocale(b.code)) - Number(isCompiledSystemLocale(a.code)) ||
					a.name.localeCompare(b.name)
			);
		const search = contentPickerSearch.toLowerCase();
		contentAvailable = iso6391.filter(
			(lang) =>
				!systemSettings.contentLanguages.includes(lang.code) &&
				(lang.code.toLowerCase().includes(search) ||
					lang.name.toLowerCase().includes(search) ||
					lang.native.toLowerCase().includes(search))
		);
	});

	// Timezone options for Dropdown
	const allTimezones = Intl.supportedValuesOf('timeZone');
	const timezoneOptions = $derived(allTimezones.map((tz: string) => ({ label: tz, value: tz })));

	// Cloudflare CDN section: collapsed by default, auto-expands when a cloud media
	// storage type is selected (which is when the cloud-credentials notice appears).
	let showCdn = $state(false);
	const cdnExpanded = $derived(showCdn || systemSettings.mediaStorageType !== 'local');

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
		<p class="text-sm text-center text-tertiary-500 dark:text-primary-500 sm:text-base">
			{setup_system_intro()}
		</p>
	</div>

	<div class="space-y-2">
		<!-- Basic Site Settings -->
		<section class="space-y-4">
			<div class="grid grid-cols-1 gap-4 md:grid-cols-3 items-start">
				<!-- Site Name -->
				<div class="flex flex-col gap-1">
					<label for="site-name" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon
							icon="mdi:web"
							width="18"
							class="text-tertiary-500 dark:text-primary-500"
							aria-hidden="true"
						></iconify-icon>
						<span class="text-surface-900 dark:text-surface-50"
							>{setup_system_site_name?.() || 'CMS Name'}</span
						>
						<SystemTooltip title={setup_help_site_name()}>
							<HelpIcon ariaLabel={setup_help_site_name_aria()} />
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
						<iconify-icon
							icon="mdi:earth"
							width="18"
							class="text-tertiary-500 dark:text-primary-500"
							aria-hidden="true"
						></iconify-icon>
						<span class="text-surface-900 dark:text-surface-50"
							>{setup_system_host_prod?.() || 'Production URL'}</span
						>
						<SystemTooltip title={setup_help_host_prod?.() || 'The production URL...'}>
							<HelpIcon ariaLabel={setup_help_host_prod_aria()} />
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

				<!-- Timezone -->
				<div class="flex flex-col gap-1">
					<label for="timezone" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon
							icon="mdi:clock-outline"
							width="18"
							class="text-tertiary-500 dark:text-primary-500"
							aria-hidden="true"
						></iconify-icon>
						<span class="text-surface-900 dark:text-surface-50"
							>{setup_system_timezone?.() || 'Timezone'}</span
						>
						<SystemTooltip title={setup_help_timezone?.() || 'Default system timezone'}>
							<HelpIcon ariaLabel={setup_help_timezone_aria()} />
						</SystemTooltip>
					</label>

					<Dropdown
						options={timezoneOptions}
						bind:value={systemSettings.timezone}
						onchange={() => handleBlur('timezone')}
						closeOnSelect={true}
						searchable={true}
						searchPlaceholder={setup_search_placeholder?.() || 'Search timezones...'}
						emptyMessage={setup_help_no_matches?.() || 'No matches found'}
						position="bottom"
					>
						{#snippet trigger()}
							<Button
								variant="outline"
								class="w-full h-10 justify-between border-(--admin-border-default) bg-(--admin-bg-input) text-(--admin-text-body) font-normal px-3 py-2"
							>
								<span class="truncate text-sm"
									>{systemSettings.timezone || setup_select_timezone()}</span
								>
								<iconify-icon
									icon="mdi:chevron-down"
									width="16"
									class="ms-auto shrink-0 text-surface-400"
								></iconify-icon>
							</Button>
						{/snippet}
					</Dropdown>
					{#if displayErrors.timezone}
						<div id="timezone-error" class="mt-1 text-xs text-error-500" role="alert">
							{displayErrors.timezone}
						</div>
					{/if}
				</div>

				<!-- Password Minimum Length -->
				<!-- Min Password Length moved to system settings page -->
				<div class="hidden">
					<input
						aria-label="Site name"
						id="password-min-length"
						bind:value={systemSettings.passwordMinLength}
						type="number"
					/>
				</div>
			</div>
		</section>

		<!-- Languages -->
		<section class="space-y-5 border-t border-surface-500/30 dark:border-surface-500/30 pt-2">
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<!-- Default System Language -->
				<div class="space-y-2 rounded border border-surface-500/30 dark:border-surface-500/20 p-4">
					<label for="default-system-lang" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon
							icon="mdi:translate"
							width="18"
							class="text-tertiary-500 dark:text-primary-500"
							aria-hidden="true"
						></iconify-icon>
						<span class="text-surface-900 dark:text-surface-50"
							>{setup_label_default_system_language?.() || 'Default System Language'}</span
						>
						<SystemTooltip title={setup_help_default_system_language()}>
							<HelpIcon ariaLabel={setup_help_default_system_language_aria()} />
						</SystemTooltip>
					</label>

					<p class="text-[10px] text-(--admin-text-muted)" id="system-lang-help">
						{setup_system_lang_primary_help()}
					</p>

					<Select
						id="default-system-lang"
						bind:value={systemSettings.defaultSystemLanguage}
						options={systemLanguageOptions}
						placeholder={setup_select_system_language()}
					/>
					<div>
						<div class="mb-1 flex items-center gap-1 text-sm font-medium tracking-wide">
							<iconify-icon
								icon="mdi:translate-variant"
								width="14"
								class="text-tertiary-500 dark:text-primary-500"
								aria-hidden="true"
							></iconify-icon>
							<span class="text-surface-900 dark:text-surface-50"
								>{setup_label_system_languages?.() || 'System Languages'}</span
							>
							<SystemTooltip title={setup_help_system_languages()}>
								<HelpIcon ariaLabel={setup_help_system_languages_aria()} />
							</SystemTooltip>
						</div>

						<div
							class="relative flex min-h-10.5 flex-wrap items-center gap-2 rounded border border-surface-500/30 dark:border-surface-500/40 p-2"
						>
							{#each systemSettings.systemLanguages as lang (lang)}
								<Badge variant="tertiary" size="lg" class="group dark:preset-filled-primary-500">
									<span class="text-xs font-medium">{displayLang(lang)}</span>
									{#if getTextDirection(lang) === 'rtl'}
										<span class="text-[9px] font-bold uppercase opacity-80"
											>{setup_badge_rtl()}</span
										>
									{/if}
									{#if isCompiledSystemLocale(lang)}
										<span class="text-[9px] font-bold uppercase opacity-80"
											>{setup_badge_translated()}</span
										>
									{:else}
										<span class="text-[9px] font-bold uppercase opacity-80"
											>{setup_badge_english_ui()}</span
										>
									{/if}
									{#if systemSettings.systemLanguages.length > 1}
										<Button
											variant="transparent"
											type="button"
											class="flex items-center justify-center -me-1.5 p-0.5! h-auto! min-w-0! rounded-full! hover:bg-surface-500/20 transition-colors"
											onclick={() => removeSystemLang(lang)}
											aria-label={`Remove ${displayLang(lang)}`}
										>
											<iconify-icon icon="mdi:close" width="14"></iconify-icon>
										</Button>
									{/if}
								</Badge>
							{/each}
							{#if iso6391.some((lang) => !systemSettings.systemLanguages.includes(lang.code))}
								<Button
									variant="surface"
									type="button"
									onclick={openSystemPicker}
									aria-label={setup_aria_add_system_language()}
									aria-haspopup="dialog"
									aria-expanded={showSystemPicker}
									aria-controls="system-lang-picker"
									rounded
									size="sm"
									class="flex items-center gap-1"
								>
									<iconify-icon icon="mdi:plus" width="14" aria-hidden="true"></iconify-icon>
									{button_add?.() || 'Add'}
								</Button>
							{/if}
							{#if showSystemPicker}
								<div
									id="system-lang-picker"
									class="absolute inset-s-0 top-full z-20 mt-2 w-64 rounded border border-surface-500/30 dark:border-surface-500/30 bg-(--admin-bg-card) p-2 shadow-xl"
									role="dialog"
									aria-label={setup_aria_add_system_language()}
									tabindex="-1"
									onkeydown={onSystemPickerKey}
								>
									<Input
										id="system-lang-search"
										aria-label={setup_aria_search_system_languages()}
										placeholder={setup_search_languages()}
										bind:value={systemPickerSearch}
										inputClass="text-xs py-1"
										class="mb-2"
									/>
									<div class="max-h-48 overflow-auto">
										{#if systemAvailable.length === 0}
											<p class="px-1 py-2 text-center text-[11px] text-(--admin-text-muted)">
												{setup_help_no_matches?.() || 'No matches'}
											</p>
										{/if}
										{#each systemAvailable as sug (sug.code)}
											<Button
												variant="transparent"
												type="button"
												class="flex w-full! items-center justify-between! rounded px-2! py-1! h-auto! text-start text-xs font-normal! hover:bg-tertiary-500/10 dark:hover:bg-tertiary-500 dark:bg-primary-500/10"
												onclick={() => addSystemLanguage(sug.code)}
												aria-label="Add language: {sug.name}"
											>
												<span class="text-surface-900 dark:text-surface-50"
													>{sug.name} ({sug.code.toUpperCase()})
													<span class="text-(--admin-text-muted)">- {sug.native}</span></span
												>
												{#if getTextDirection(sug.code) === 'rtl'}
													<span
														class="text-[9px] font-bold uppercase text-tertiary-500 dark:text-primary-500"
														>{setup_badge_rtl()}</span
													>
												{/if}
												<iconify-icon
													icon="mdi:plus-circle-outline"
													width="14"
													class="text-tertiary-500 dark:text-primary-500"
													aria-hidden="true"
												></iconify-icon>
											</Button>
										{/each}
									</div>
								</div>
							{/if}
						</div>
						<p class="mt-2 text-[10px] leading-relaxed text-(--admin-text-muted)">
							{setup_note_machine_translate()}
						</p>
					</div>
				</div>
				<!-- Default Content Language -->
				<div class="space-y-2 rounded border border-surface-500/30 dark:border-surface-500/20 p-4">
					<div class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon
							icon="mdi:book-open-page-variant"
							width="18"
							class="text-tertiary-500 dark:text-primary-500"
							aria-hidden="true"
						></iconify-icon>
						<span class="text-surface-900 dark:text-surface-50"
							>{setup_label_default_content_language?.() || 'Default Content Language'}</span
						>
						<SystemTooltip title={setup_help_default_content_language()}>
							<HelpIcon ariaLabel={setup_help_default_content_language_aria()} />
						</SystemTooltip>
					</div>
					<p class="text-[10px] text-(--admin-text-muted)" id="content-lang-help">
						{setup_content_lang_primary_help()}
					</p>
					<Select
						bind:value={systemSettings.defaultContentLanguage}
						options={contentLanguageOptions}
						placeholder={setup_select_content_language()}
						error={displayErrors.defaultContentLanguage}
						onchange={() => handleBlur('defaultContentLanguage')}
					/>
					<div>
						<div class="mb-1 flex items-center gap-1 text-sm font-medium tracking-wide">
							<iconify-icon
								icon="mdi:book-multiple"
								width="14"
								class="text-tertiary-500 dark:text-primary-500"
								aria-hidden="true"
							></iconify-icon>
							<span class="text-surface-900 dark:text-surface-50"
								>{setup_label_content_languages?.() || 'Content Languages'}</span
							>
							<SystemTooltip title={setup_help_content_languages()}>
								<HelpIcon ariaLabel={setup_help_content_languages_aria()} />
							</SystemTooltip>
						</div>

						<div
							class="relative flex min-h-10.5 flex-wrap items-center gap-2 rounded border p-2 {displayErrors.contentLanguages
								? 'border-error-500 bg-error-500/10 dark:bg-error-900/20'
								: 'border-surface-500/30 dark:border-surface-500/40 '}"
						>
							{#each systemSettings.contentLanguages as lang (lang)}
								<Badge variant="tertiary" size="lg" class="group dark:preset-filled-primary-500">
									<span class="text-xs font-medium">{displayLang(lang)}</span>
									{#if lang !== systemSettings.defaultContentLanguage || systemSettings.contentLanguages.length > 1}
										<Button
											variant="transparent"
											type="button"
											class="flex items-center justify-center -me-1.5 p-0.5! h-auto! min-w-0! rounded-full! hover:bg-surface-500/20 transition-colors"
											onclick={() => removeContentLang(lang)}
											aria-label={`Remove ${displayLang(lang)}`}
										>
											<iconify-icon icon="mdi:close" width="14"></iconify-icon>
										</Button>
									{/if}
								</Badge>
							{/each}
							<Button
								variant="surface"
								type="button"
								onclick={openContentPicker}
								aria-label={setup_aria_add_content_language()}
								aria-haspopup="dialog"
								aria-expanded={showContentPicker}
								aria-controls="content-lang-picker"
								rounded
								size="sm"
								class="flex items-center gap-1"
							>
								<iconify-icon icon="mdi:plus" width="14" aria-hidden="true"></iconify-icon>
								{button_add?.() || 'Add'}
							</Button>
							{#if showContentPicker}
								<div
									id="content-lang-picker"
									class="absolute inset-s-0 top-full z-20 mt-2 w-64 rounded border border-white/10 bg-surface-800 p-2 shadow-xl"
									role="dialog"
									aria-label={setup_aria_add_content_language()}
									tabindex="-1"
									onkeydown={onContentPickerKey}
								>
									<Input
										id="content-lang-search"
										aria-label={setup_aria_search_content_languages()}
										placeholder={setup_search_languages()}
										bind:value={contentPickerSearch}
										inputClass="text-xs py-1"
										class="mb-2"
									/>
									<div class="max-h-48 overflow-auto">
										{#if contentAvailable.length === 0}
											<p class="px-1 py-2 text-center text-[11px] text-(--admin-text-muted)">
												{setup_help_no_matches?.() || 'No matches'}
											</p>
										{/if}
										{#each contentAvailable as sug (sug.code)}
											<Button
												variant="transparent"
												type="button"
												class="flex w-full! items-center justify-between! rounded px-2! py-1! h-auto! text-start text-xs font-normal! hover:bg-tertiary-500/10 dark:hover:bg-tertiary-500 dark:bg-primary-500/10"
												onclick={() => addContentLanguage(sug.code)}
												aria-label="Add content language: {sug.name}"
											>
												<span class="text-surface-900 dark:text-surface-50"
													>{sug.name} ({sug.code.toUpperCase()})
													<span class="text-(--admin-text-muted)">- {sug.native}</span></span
												>
												<iconify-icon
													icon="mdi:plus-circle-outline"
													width="14"
													class="text-tertiary-500 dark:text-primary-500"
													aria-hidden="true"
												></iconify-icon>
											</Button>
										{/each}
									</div>
								</div>
							{/if}
						</div>
						{#if displayErrors.contentLanguages}
							<div class="mt-1 text-xs text-error-500" role="alert">
								{displayErrors.contentLanguages}
							</div>
						{/if}
					</div>
				</div>
			</div>
		</section>

		<!-- Media Storage -->
		<section class="space-y-4 border-t border-surface-500/30 pt-4 dark:border-surface-500/30">
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 items-start">
				<!-- Media Storage Configuration -->
				<div class="space-y-2">
					<label for="media-storage-type" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon
							icon="mdi:cloud-outline"
							width="18"
							class="text-tertiary-500 dark:text-primary-500"
							aria-hidden="true"
						></iconify-icon>
						<span class="text-surface-900 dark:text-surface-50"
							>{setup_system_media_type?.() || 'Media Storage Type'}</span
						>
						<SystemTooltip title={setup_help_media_type?.() || setup_help_media_path()}>
							<HelpIcon ariaLabel="Help: Media Storage Type" />
						</SystemTooltip>
					</label>

					<Select
						id="media-storage-type"
						bind:value={systemSettings.mediaStorageType}
						options={mediaStorageOptions}
						placeholder="Select storage type..."
					/>
				</div>

				<!-- Media Folder Path -->
				<div class="space-y-2">
					<label for="media-folder" class="mb-1 flex items-center gap-1 text-sm font-medium">
						<iconify-icon
							icon="mdi:folder"
							width="18"
							class="text-tertiary-500 dark:text-primary-500"
							aria-hidden="true"
						></iconify-icon>
						<span class="text-surface-900 dark:text-surface-50">
							{systemSettings.mediaStorageType === 'local'
								? setup_system_media_folder_local?.() || 'Media Folder Path'
								: setup_system_media_folder_cloud?.() || 'Bucket/Cloud Name'}
						</span>
						<SystemTooltip title={setup_help_media_type?.() || 'Storage path configuration'}>
							<HelpIcon ariaLabel="Help: Media Folder" />
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
				</div>
			</div>
		</section>

		<!-- Cloudflare CDN — collapsible (default collapsed; auto-expands for cloud storage) -->
		<section class="space-y-4 border-t border-surface-500/30 pt-4 dark:border-surface-500/30">
			<div class="flex items-center gap-2">
				<Button
					variant="transparent"
					type="button"
					onclick={() => (showCdn = !cdnExpanded)}
					aria-expanded={cdnExpanded}
					aria-label={cdnExpanded
						? 'Collapse Advanced: Enterprise Scaling (Cloudflare CDN)'
						: 'Expand Advanced: Enterprise Scaling (Cloudflare CDN)'}
					class="flex items-center gap-2 p-0! h-auto! min-w-0! text-base font-medium! text-surface-900 dark:text-surface-50"
				>
					<iconify-icon icon={cdnExpanded ? 'mdi:chevron-up' : 'mdi:chevron-down'} width="18"
					></iconify-icon>
					<iconify-icon
						icon="mdi:cloud-cog"
						width="18"
						class="text-tertiary-500 dark:text-primary-500"
					></iconify-icon>
					Advanced: Enterprise Scaling (Cloudflare CDN)
				</Button>
				<SystemTooltip
					title="Purges Cloudflare's edge cache when content changes, so visitors get fresh pages immediately instead of waiting for the CDN's own expiry. Requires a Cloudflare API token with cache-purge permission and the zone ID. This is edge/CDN caching — separate from the database read replicas under Database → Advanced Database Options (Clustering & Scaling)."
				>
					<HelpIcon ariaLabel="Help: Cloudflare CDN purging" />
				</SystemTooltip>
				{#if systemSettings.mediaStorageType !== 'local'}
					<span
						class="ms-auto flex items-center gap-1 rounded border border-warning-500/50 bg-warning-500/50 px-2 py-1 text-[11px] font-normal text-warning-600 dark:border-warning-500/40 dark:bg-warning-900/20 dark:text-warning-400"
						role="status"
					>
						<iconify-icon icon="mdi:information-outline" width="14" aria-hidden="true"
						></iconify-icon>
						{setup_note_cloud_credentials?.() ||
							'Cloud storage credentials must be configured in System Settings after setup.'}
					</span>
				{/if}
			</div>

			{#if cdnExpanded}
				<div class="space-y-4 rounded border border-surface-500/30 dark:border-surface-500/30 p-4">
					<p class="text-xs text-(--admin-text-muted)">
						Configure native CDN purging to synchronize global edge nodes instantly upon content
						updates.
					</p>

					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<Input
							id="cf-token"
							bind:value={systemSettings.cfApiToken}
							type="password"
							placeholder="Enter API Token"
						>
							{#snippet labelSnippet()}
								<span
									class="flex items-center gap-1 text-base font-medium text-surface-900 dark:text-surface-50"
								>
									Cloudflare API Token
									<SystemTooltip
										title="A Cloudflare API token with permission to purge the cache for this zone. Create one under My Profile → API Tokens."
									>
										<HelpIcon ariaLabel="Help: Cloudflare API Token" />
									</SystemTooltip>
								</span>
							{/snippet}
						</Input>
						<Input
							id="cf-zone"
							bind:value={systemSettings.cfZoneId}
							type="text"
							placeholder="Enter Zone ID"
						>
							{#snippet labelSnippet()}
								<span
									class="flex items-center gap-1 text-base font-medium text-surface-900 dark:text-surface-50"
								>
									Cloudflare Zone ID
									<SystemTooltip
										title="The Cloudflare zone ID for your domain, shown on the site's Overview page in the Cloudflare dashboard."
									>
										<HelpIcon ariaLabel="Help: Cloudflare Zone ID" />
									</SystemTooltip>
								</span>
							{/snippet}
						</Input>
					</div>

					<div class="space-y-1">
						<Select
							bind:value={systemSettings.cfPurgeMode}
							options={cfPurgeOptions}
							placeholder="Select purge strategy..."
							size="sm"
							ariaLabel="Purge Strategy"
						>
							{#snippet labelSnippet()}
								<span
									class="flex items-center gap-1 text-base font-medium text-surface-900 dark:text-surface-50"
								>
									Purge Strategy
									<SystemTooltip
										title="How the CDN cache is invalidated. 'Surgical (tag-based)' purges only the changed URLs and needs Cloudflare Enterprise or Cache Tags; 'Entire cache' purges everything."
									>
										<HelpIcon ariaLabel="Help: Purge Strategy" />
									</SystemTooltip>
								</span>
							{/snippet}
						</Select>
						<p class="text-[10px] text-warning-500 italic mt-1">
							* Surgical purging requires a Cloudflare Enterprise plan or specific Cache Tag
							support.
						</p>
					</div>
				</div>
			{/if}
		</section>

		<!-- System Infrastructure / Mode -->
		<section
			id="infrastructure-section"
			class="space-y-4 border-t border-surface-500/30 pt-4 dark:border-surface-500/30"
		>
			<h4
				class="flex items-center gap-2 text-sm font-semibold text-surface-500 dark:text-primary-500"
			>
				<iconify-icon icon="mdi:server-network" width="18"></iconify-icon>
				{setup_system_infrastructure_mode?.() || 'System Infrastructure / Mode'}
			</h4>

			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<!-- Multi-Tenant Toggle -->
				<Checkbox
					bind:checked={systemSettings.multiTenant}
					label={setup_system_multi_tenant?.() || 'Multi-Tenant Mode'}
					description={setup_system_multi_tenant_desc?.() ||
						'Enables support for multiple isolated tenants...'}
					variant="card"
					onchange={(checked) => {
						if (!checked && systemSettings.demoMode) {
							systemSettings.demoMode = false;
						}
					}}
				/>

				<!-- Demo Mode Toggle -->
				<div class="space-y-2">
					<Checkbox
						bind:checked={systemSettings.demoMode}
						label={setup_system_demo_mode?.() || 'Demo Mode'}
						description={(
							setup_system_demo_mode_desc?.() ||
							'Warning: Creates ephemeral environments for visitors.'
						).replace(/<\/?[^>]+(>|$)/g, '')}
						variant="card"
						onchange={(checked) => {
							if (checked && !systemSettings.multiTenant) {
								systemSettings.multiTenant = true;
							}
						}}
					/>
					<span
						class="text-xs font-bold {systemSettings.demoMode && !systemSettings.multiTenant
							? 'text-warning-600 dark:text-warning-400'
							: 'hidden'}"
						aria-hidden={!(systemSettings.demoMode && !systemSettings.multiTenant)}
					>
						({setup_note_demo_requires_multitenant?.() || 'Enables Multi-Tenant'})
					</span>
				</div>
			</div>
		</section>
	</div>
</form>
