<!--
@file  src/routes/(app)/config/systemsetting/GenericSettingsGroup.svelte
@component
**Generic component for rendering any settings group**

Handles all field types and validation automatically

### Props
- `group`: The settings group to render, containing fields and metadata.

### Feature:
- Handles all field types including text, number, boolean, password, select, multi-select, language picker, log level picker, and array inputs
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { SettingGroup, SettingField } from './settingsGroups';
	import { toaster } from '@stores/store.svelte';
	// getModalStore deprecated - use modalState from @utils/modalState.svelte;
	import iso6391 from '@utils/iso639-1.json';
	import { getLanguageName } from '@utils/languageUtils';
	import { logger } from '@utils/logger';
	import { showConfirm } from '@utils/modalState.svelte';

	// Log levels from logger.svelte.ts
	const LOG_LEVELS = ['none', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;
	type LogLevel = (typeof LOG_LEVELS)[number];

	interface Props {
		group: SettingGroup;
		groupsNeedingConfig: Writable<Set<string>>;
		onUnsavedChanges?: (hasChanges: boolean) => void;
	}

	const { group, groupsNeedingConfig, onUnsavedChanges }: Props = $props();

	let loading = $state(false);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let values = $state<Record<string, unknown>>({});
	let originalValues = $state<Record<string, unknown>>({}); // Track original values
	let errors = $state<Record<string, string>>({});
	let hasEmptyRequiredFields = $state(false);
	let hasUnsavedChanges = $state(false);
	const showPassword = $state<Record<string, boolean>>({}); // Track password visibility per field
	const showLanguagePicker = $state<Record<string, boolean>>({}); // Track language picker visibility per field
	const languageSearch = $state<Record<string, string>>({}); // Track search input per field
	const showLogLevelPicker = $state<Record<string, boolean>>({}); // Track log level picker visibility per field
	let allowedLocales = $state<string[]>([]); // Locales from project.inlang/settings.json

	// Load allowed locales from project.inlang/settings.json
	async function loadAllowedLocales() {
		try {
			const response = await fetch('/project.inlang/settings.json');
			const data = await response.json();
			if (data.locales && Array.isArray(data.locales)) {
				allowedLocales = data.locales;
			}
		} catch (err) {
			logger.warn('[GenericSettingsGroup] Could not load project.inlang/settings.json, using all languages:', err);
			// Fall back to all languages if we can't read the file
			allowedLocales = [];
		}
	}

	// Track if values have changed
	$effect(() => {
		// Compare current values with original values
		const changed = Object.keys(values).some((key) => {
			return JSON.stringify(values[key]) !== JSON.stringify(originalValues[key]);
		});
		hasUnsavedChanges = changed;

		// Notify parent component
		if (onUnsavedChanges) {
			onUnsavedChanges(hasUnsavedChanges);
		}
	});

	// Check if there are empty or placeholder values that need configuration
	function checkForEmptyFields() {
		hasEmptyRequiredFields = group.fields.some((field) => {
			const value = values[field.key];

			// Check for empty strings, especially in critical fields like email, host, etc.
			if (typeof value === 'string') {
				return value === '' && (field.required || field.key.includes('HOST') || field.key.includes('EMAIL'));
			}

			return false;
		});

		// Update the store
		groupsNeedingConfig.update((groups) => {
			if (hasEmptyRequiredFields) {
				groups.add(group.id);
			} else {
				groups.delete(group.id);
			}
			return groups;
		});
	}

	// Load current values
	async function loadSettings(bypassCache = false) {
		loading = true;
		error = null;

		try {
			// Load values from API with optional cache bypass
			const url = bypassCache ? `/api/settings/${group.id}?refresh=true` : `/api/settings/${group.id}`;
			const response = await fetch(url);
			const data = await response.json();

			if (data.success) {
				values = data.values || {};
				// Store a deep copy of original values
				originalValues = JSON.parse(JSON.stringify(values));
				checkForEmptyFields(); // Check if configuration is needed
			} else {
				throw new Error(data.error || 'Failed to load settings');
			}
		} catch (err) {
			logger.error(`[${group.id}] Load error:`, err);
			error = err instanceof Error ? err.message : 'Failed to load settings';
		} finally {
			loading = false;
		}
	}

	// Utility: Display language name using Intl.DisplayNames API
	function displayLanguage(code: string): string {
		try {
			return getLanguageName(code);
		} catch {
			return code.toUpperCase();
		}
	}

	// Utility: Get appropriate icon for field
	function getFieldIcon(field: SettingField): string {
		// Check field key patterns first
		const key = field.key.toLowerCase();
		if (key.includes('email') || key.includes('smtp_user')) return 'mdi:email';
		if (key.includes('password') || key.includes('secret') || key.includes('token')) return 'mdi:lock';
		if (key.includes('host') || key.includes('url') || key.includes('domain')) return 'mdi:web';
		if (key.includes('port')) return 'mdi:power-plug';
		if (key.includes('database') || key.includes('db')) return 'mdi:database';
		if (key.includes('path') || key.includes('folder') || key.includes('directory')) return 'mdi:folder';
		if (key.includes('log') || key.includes('logging')) return 'mdi:math-log';
		if (key.includes('cache')) return 'mdi:cached';
		if (key.includes('timeout') || key.includes('duration') || key.includes('ttl')) return 'mdi:timer';
		if (key.includes('limit') || key.includes('max') || key.includes('min')) return 'mdi:speedometer';
		if (key.includes('enable') || key.includes('allow')) return 'mdi:toggle-switch';
		if (key.includes('jwt')) return 'mdi:key';
		if (key.includes('oauth') || key.includes('auth')) return 'mdi:shield-account';
		if (key.includes('redis')) return 'mdi:database-cog';
		if (key.includes('smtp')) return 'mdi:email-send';
		if (key.includes('site') || key.includes('name')) return 'mdi:web-box';
		if (key.includes('storage')) return 'mdi:harddisk';
		if (key.includes('backup')) return 'mdi:backup-restore';

		// Check field type
		if (field.type === 'boolean') return 'mdi:checkbox-marked';
		if (field.type === 'number') return 'mdi:numeric';
		if (field.type === 'array') return 'mdi:format-list-bulleted';
		if (field.type === 'select') return 'mdi:form-dropdown';
		if (field.type === 'password') return 'mdi:lock';
		if (field.type === 'loglevel-multi') return 'mdi:math-log';

		// Default icon
		return 'mdi:text-box';
	}

	// Helper for language picker
	function toggleLanguage(fieldKey: string, langCode: string) {
		const currentValues = (values[fieldKey] as string[]) || [];
		if (currentValues.includes(langCode)) {
			values[fieldKey] = currentValues.filter((code) => code !== langCode);
		} else {
			values[fieldKey] = [...currentValues, langCode];
		}
		// Trigger validation
		const field = group.fields.find((f: SettingField) => f.key === fieldKey);
		if (field) {
			const validationError = validateField(field, values[fieldKey]);
			if (validationError) {
				errors[fieldKey] = validationError;
			} else {
				delete errors[fieldKey];
			}
		}
	}

	function removeLanguage(fieldKey: string, langCode: string) {
		const currentValues = (values[fieldKey] as string[]) || [];
		values[fieldKey] = currentValues.filter((code) => code !== langCode);
		// Trigger validation
		const field = group.fields.find((f: SettingField) => f.key === fieldKey);
		if (field) {
			const validationError = validateField(field, values[fieldKey]);
			if (validationError) {
				errors[fieldKey] = validationError;
			} else {
				delete errors[fieldKey];
			}
		}
	}

	// Helper for log level picker
	function toggleLogLevel(fieldKey: string, level: LogLevel) {
		const currentValues = (values[fieldKey] as LogLevel[]) || [];
		if (currentValues.includes(level)) {
			values[fieldKey] = currentValues.filter((l) => l !== level);
		} else {
			values[fieldKey] = [...currentValues, level];
		}
		// Trigger validation
		const field = group.fields.find((f: SettingField) => f.key === fieldKey);
		if (field) {
			const validationError = validateField(field, values[fieldKey]);
			if (validationError) {
				errors[fieldKey] = validationError;
			} else {
				delete errors[fieldKey];
			}
		}
	}

	function removeLogLevel(fieldKey: string, level: LogLevel) {
		const currentValues = (values[fieldKey] as LogLevel[]) || [];
		values[fieldKey] = currentValues.filter((l) => l !== level);
		// Trigger validation
		const field = group.fields.find((f: SettingField) => f.key === fieldKey);
		if (field) {
			const validationError = validateField(field, values[fieldKey]);
			if (validationError) {
				errors[fieldKey] = validationError;
			} else {
				delete errors[fieldKey];
			}
		}
	}

	// Validate a single field
	function validateField(field: SettingField, value: unknown): string | null {
		// Required check
		if (field.required && (value === undefined || value === null || value === '')) {
			return `${field.label} is required`;
		}

		// Email validation for email-related fields
		if (
			typeof value === 'string' &&
			value &&
			(field.key.toLowerCase().includes('email') || field.key === 'SMTP_USER' || field.label.toLowerCase().includes('email'))
		) {
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			if (!emailRegex.test(value)) {
				return `${field.label} must be a valid email address`;
			}
		}

		// Type-specific validation
		if (field.type === 'number' && typeof value === 'number') {
			if (field.min !== undefined && value < field.min) {
				return `${field.label} must be at least ${field.min}`;
			}
			if (field.max !== undefined && value > field.max) {
				return `${field.label} must be at most ${field.max}`;
			}
		}

		// Custom validation
		if (field.validation) {
			return field.validation(value);
		}

		return null;
	}

	// Validate all fields
	function validateAll(): boolean {
		errors = {};
		let isValid = true;

		group.fields.forEach((field) => {
			const err = validateField(field, values[field.key]);
			if (err) {
				errors[field.key] = err;
				isValid = false;
			}
		});

		return isValid;
	}

	// Save settings
	async function saveSettings() {
		if (!validateAll()) {
			error = 'Please fix the validation errors';
			return;
		}

		saving = true;
		error = null;

		try {
			const response = await fetch(`/api/settings/${group.id}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(values)
			});

			const data = await response.json();

			if (data.success) {
				let message = `${group.name} settings saved successfully!`;
				if (group.requiresRestart) {
					message += ' Server restart required for changes to take effect.';
				}
				toaster.success({ description: message });
				await loadSettings(true); // Bypass cache after save - this also resets originalValues
				checkForEmptyFields(); // Update the warning status after save
			} else {
				error = data.error || 'Failed to save settings';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save settings';
		} finally {
			saving = false;
		}
	}

	// Reset to defaults (with confirmation)
	async function resetToDefaults() {
		showConfirm({
			title: 'Reset Settings',
			body: `Are you sure you want to reset all <strong>${group.name}</strong> settings to their default values? This action cannot be undone.`,
			onConfirm: async () => {
				saving = true;
				error = null;

				try {
					const response = await fetch(`/api/settings/${group.id}`, {
						method: 'DELETE'
					});

					const data = await response.json();

					if (data.success) {
						toaster.success({ description: `${group.name} settings reset to defaults!` });
						await loadSettings(true); // Bypass cache after reset
						checkForEmptyFields(); // Re-check after reset
					} else {
						error = data.error || 'Failed to reset settings';
						toaster.error({ description: error || 'Failed to reset settings' });
					}
				} catch (err) {
					error = err instanceof Error ? err.message : 'Failed to reset settings';
					toaster.error({ description: error || 'Failed to reset settings' });
				} finally {
					saving = false;
				}
			}
		});
	}

	// Format duration for display
	function formatDuration(seconds: number): string {
		if (seconds < 60) return `${seconds}s`;
		if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
		const hours = Math.floor(seconds / 3600);
		const mins = Math.floor((seconds % 3600) / 60);
		return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
	}

	// Handle array input (comma-separated)
	function handleArrayInput(field: SettingField, event: Event) {
		const input = (event.target as HTMLInputElement).value;
		values[field.key] = input
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
	}

	// Get array display value
	function getArrayValue(key: string): string {
		const val = values[key];
		if (Array.isArray(val)) {
			return val.join(', ');
		}
		return '';
	}

	// Close language picker on click outside
	$effect(() => {
		const openPickers = Object.keys(showLanguagePicker).filter((key) => showLanguagePicker[key]);
		if (openPickers.length === 0) return;

		const handler = (e: MouseEvent) => {
			openPickers.forEach((key) => {
				const el = document.getElementById(`${key}-lang-picker`);
				if (el && !el.contains(e.target as Node)) {
					showLanguagePicker[key] = false;
				}
			});
		};

		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	});

	// Close log level picker on click outside
	$effect(() => {
		const openPickers = Object.keys(showLogLevelPicker).filter((key) => showLogLevelPicker[key]);
		if (openPickers.length === 0) return;

		const handler = (e: MouseEvent) => {
			openPickers.forEach((key) => {
				const el = document.getElementById(`${key}-loglevel-picker`);
				if (el && !el.contains(e.target as Node)) {
					showLogLevelPicker[key] = false;
				}
			});
		};

		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	});

	onMount(() => {
		loadSettings();
		loadAllowedLocales();
	});
</script>

<div class="space-y-4 max-w-full overflow-x-hidden">
	<!-- Header -->
	<div class="mb-6">
		<h2 class="mb-2 text-xl font-bold md:text-2xl">
			<span class=" mr-2">{group.icon}</span>
			{group.name}
		</h2>
		<p class="text-sm text-surface-600 dark:text-surface-300">{group.description}</p>
	</div>

	<!-- Restart Warning -->
	{#if group.requiresRestart}
		<div class="alert preset-filled-warning-500 mb-4 rounded-xl p-3 md:p-4">
			<div class="alert-message">
				<strong class="mb-1 block text-sm md:text-base">⚠️ Restart Required</strong>
				<p class="text-xs md:text-sm">Changes to these settings require a server restart to take effect.</p>
			</div>
		</div>
	{/if}

	<!-- Default Values Notice -->
	{#if hasEmptyRequiredFields}
		<div class="bordered alert preset-filled-error-500 mb-4 rounded-xl p-3 md:p-4">
			<div class="alert-message">
				<strong class="mb-1 block text-sm md:text-base">ℹ️ Default Values Detected</strong>
				<p class="text-xs md:text-sm">
					Some settings are using placeholder values from the system defaults. Please review and update these values to match your infrastructure and
					requirements before using in production.
				</p>
			</div>
		</div>
	{/if}

	<!-- Loading State -->
	{#if loading}
		<div class="card preset-soft-surface-500 rounded-xl p-6 text-center">
			<p>Loading settings...</p>
		</div>
	{:else}
		<!-- Error Message -->
		{#if error}
			<div class="alert preset-filled-error-500 mb-4 rounded-xl p-3 md:p-4">
				<div class="alert-message">
					<strong class="mb-1 block text-sm md:text-base">Error</strong>
					<p class="text-xs md:text-sm">{error}</p>
				</div>
			</div>
		{/if}

		<!-- Settings Form -->
		<form
			onsubmit={(e) => {
				e.preventDefault();
				saveSettings();
			}}
			class="space-y-4 md:space-y-6"
		>
			<!-- Special Layout for Languages Group -->
			{#if group.id === 'languages'}
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					<!-- Left Column: Default Content Language + Available Content Languages -->
					{#each [null] as _}
						{@const defaultLangField = group.fields.find((f) => f.key === 'DEFAULT_CONTENT_LANGUAGE')}
						{@const availableLangsField = group.fields.find((f) => f.key === 'AVAILABLE_CONTENT_LANGUAGES')}

						<div class="space-y-3 rounded-md border border-slate-300/50 bg-surface-50/60 p-4 dark:border-slate-600/60 dark:bg-surface-800/40">
							{#if defaultLangField}
								<div>
									<label for={defaultLangField.key} class="mb-1 flex items-center gap-1 text-sm font-medium">
										<iconify-icon icon="mdi:book-open-page-variant" width="18" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
										<span>{defaultLangField.label}</span>
										{#if defaultLangField.required}
											<span class="text-error-500">*</span>
										{/if}
										<button
											type="button"
											class="ml-1 text-slate-400 hover:text-primary-500"
											data-tooltip={defaultLangField.description}
											aria-label="Field information"
										>
											<iconify-icon icon="mdi:help-circle-outline" width="16"></iconify-icon>
										</button>
									</label>
									<select
										id={defaultLangField.key}
										bind:value={values[defaultLangField.key]}
										class="input w-full rounded {errors[defaultLangField.key] ? 'border-error-500' : ''}"
										required={defaultLangField.required}
										onchange={() => (errors[defaultLangField.key] = '')}
									>
										{#if (values.AVAILABLE_CONTENT_LANGUAGES as string[])?.length > 0}
											{#each values.AVAILABLE_CONTENT_LANGUAGES as string[] as langCode}
												<option value={langCode}>{displayLanguage(langCode)} ({langCode})</option>
											{/each}
										{:else}
											<option value="en">English (en)</option>
										{/if}
									</select>
									{#if errors[defaultLangField.key]}
										<div class="mt-1 text-xs text-error-500">{errors[defaultLangField.key]}</div>
									{/if}
								</div>
							{/if}

							{#if availableLangsField}
								<div>
									<div class="mb-1 flex items-center gap-1 text-sm font-medium tracking-wide">
										<iconify-icon icon="mdi:book-multiple" width="14" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
										<span>{availableLangsField.label}</span>
										{#if availableLangsField.required}
											<span class="text-error-500">*</span>
										{/if}
										<button
											type="button"
											class="ml-1 text-slate-400 hover:text-primary-500"
											data-tooltip={availableLangsField.description}
											aria-label="Field information"
										>
											<iconify-icon icon="mdi:help-circle-outline" width="14"></iconify-icon>
										</button>
									</div>
									<div class="relative">
										<div
											class="flex min-h-10 flex-wrap gap-2 rounded border p-2 pr-16 {errors[availableLangsField.key]
												? 'border-error-500 bg-error-50 dark:bg-error-900/20'
												: 'border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700/40'}"
										>
											{#if (values[availableLangsField.key] as string[])?.length > 0}
												{#each values[availableLangsField.key] as string[] as langCode}
													<span
														class="group preset-ghost-tertiary-500 badge inline-flex items-center gap-1 rounded-full dark:preset-ghost-primary-500"
													>
														{displayLanguage(langCode)} ({langCode})
														{#if !availableLangsField.readonly}
															<button
																type="button"
																class="opacity-60 transition hover:opacity-100"
																onclick={() => removeLanguage(availableLangsField.key, langCode)}
																aria-label="Remove {langCode}"
															>
																×
															</button>
														{/if}
													</span>
												{/each}
											{:else if availableLangsField.placeholder}
												<span class="text-surface-500 dark:text-surface-400 text-xs">{availableLangsField.placeholder}</span>
											{/if}

											{#if !availableLangsField.readonly}
												<button
													type="button"
													class="preset-filled-surface-500 badge absolute right-2 top-2 rounded-full"
													onclick={() => {
														showLanguagePicker[availableLangsField.key] = true;
														languageSearch[availableLangsField.key] = '';
													}}
													aria-haspopup="dialog"
													aria-expanded={showLanguagePicker[availableLangsField.key]}
													aria-controls="{availableLangsField.key}-lang-picker"
												>
													<iconify-icon icon="mdi:plus" width="14"></iconify-icon>
													Add
												</button>
											{/if}
										</div>

										<!-- Language Picker Dropdown -->
										{#if showLanguagePicker[availableLangsField.key]}
											<div
												id="{availableLangsField.key}-lang-picker"
												class="absolute left-0 top-full z-20 mt-2 w-64 rounded-md border border-slate-300/60 bg-surface-50 p-2 shadow-lg dark:border-slate-600 dark:bg-surface-800"
												role="dialog"
												aria-label="Add language"
												tabindex="-1"
											>
												<input
													class="mb-2 w-full rounded border border-slate-300/60 bg-transparent px-2 py-1 text-xs outline-none focus:border-primary-500 dark:border-slate-600"
													placeholder="Search..."
													bind:value={languageSearch[availableLangsField.key]}
												/>
												<div class="max-h-48 overflow-auto">
													{#each iso6391.filter((lang: { code: string; name: string; native: string }) => {
														const search = (languageSearch[availableLangsField.key] || '').toLowerCase();
														const currentValues = (values[availableLangsField.key] as string[]) || [];
														return !currentValues.includes(lang.code) && (search === '' || lang.name.toLowerCase().includes(search) || lang.native
																	.toLowerCase()
																	.includes(search) || lang.code.toLowerCase().includes(search));
													}) as lang}
														<button
															type="button"
															class="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-primary-500/10"
															onclick={() => {
																toggleLanguage(availableLangsField.key, lang.code);
																showLanguagePicker[availableLangsField.key] = false;
																// Set as default if it's the first language
																if (!(values[availableLangsField.key] as string[])?.length || !values.DEFAULT_CONTENT_LANGUAGE) {
																	values.DEFAULT_CONTENT_LANGUAGE = lang.code;
																}
															}}
														>
															<span>{lang.native} ({lang.code})</span>
															<iconify-icon icon="mdi:plus-circle-outline" width="14" class="text-primary-500"></iconify-icon>
														</button>
													{:else}
														<p class="px-1 py-2 text-center text-[11px] text-slate-500">No matches</p>
													{/each}
												</div>
											</div>
										{/if}
									</div>
									{#if errors[availableLangsField.key]}
										<div class="mt-1 text-xs text-error-500">{errors[availableLangsField.key]}</div>
									{/if}
									{#if availableLangsField.placeholder}
										<p class="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Example: {availableLangsField.placeholder}</p>
									{/if}
								</div>
							{/if}
						</div>
					{/each}

					<!-- Right Column: Base Locale + Available Locales -->
					{#each [null] as _}
						{@const baseLocaleField = group.fields.find((f) => f.key === 'BASE_LOCALE')}
						{@const localesField = group.fields.find((f) => f.key === 'LOCALES')}

						<div class="space-y-3 rounded-md border border-slate-300/50 bg-surface-50/60 p-4 dark:border-slate-600/60 dark:bg-surface-800/40">
							{#if baseLocaleField}
								<div>
									<label for={baseLocaleField.key} class="mb-1 flex items-center gap-1 text-sm font-medium">
										<iconify-icon icon="mdi:translate" width="18" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
										<span>{baseLocaleField.label}</span>
										{#if baseLocaleField.required}
											<span class="text-error-500">*</span>
										{/if}
										<button
											type="button"
											class="ml-1 text-slate-400 hover:text-primary-500"
											data-tooltip={baseLocaleField.description}
											aria-label="Field information"
										>
											<iconify-icon icon="mdi:help-circle-outline" width="16"></iconify-icon>
										</button>
									</label>
									<select
										id={baseLocaleField.key}
										bind:value={values[baseLocaleField.key]}
										class="input w-full rounded {errors[baseLocaleField.key] ? 'border-error-500' : ''}"
										required={baseLocaleField.required}
										onchange={() => (errors[baseLocaleField.key] = '')}
									>
										{#if (values.LOCALES as string[])?.length > 0}
											{#each values.LOCALES as string[] as langCode}
												<option value={langCode}>{displayLanguage(langCode)} ({langCode})</option>
											{/each}
										{:else}
											<option value="en">English (en)</option>
										{/if}
									</select>
									{#if errors[baseLocaleField.key]}
										<div class="mt-1 text-xs text-error-500">{errors[baseLocaleField.key]}</div>
									{/if}
								</div>
							{/if}

							{#if localesField}
								<div>
									<div class="mb-1 flex items-center gap-1 text-sm font-medium tracking-wide">
										<iconify-icon icon="mdi:translate-variant" width="14" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
										<span>{localesField.label}</span>
										{#if localesField.required}
											<span class="text-error-500">*</span>
										{/if}
										<button
											type="button"
											class="ml-1 text-slate-400 hover:text-primary-500"
											data-tooltip={localesField.description}
											aria-label="Field information"
										>
											<iconify-icon icon="mdi:help-circle-outline" width="14"></iconify-icon>
										</button>
									</div>
									<div class="relative">
										<div
											class="flex min-h-10 flex-wrap gap-2 rounded border p-2 pr-16 {errors[localesField.key]
												? 'border-error-500 bg-error-50 dark:bg-error-900/20'
												: 'border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700/40'}"
										>
											{#if (values[localesField.key] as string[])?.length > 0}
												{#each values[localesField.key] as string[] as langCode}
													<span
														class="group preset-ghost-tertiary-500 badge inline-flex items-center gap-1 rounded-full dark:preset-ghost-primary-500"
													>
														{displayLanguage(langCode)} ({langCode})
														{#if !localesField.readonly}
															<button
																type="button"
																class="opacity-60 transition hover:opacity-100"
																onclick={() => {
																	const currentBase = values.BASE_LOCALE;
																	removeLanguage(localesField.key, langCode);
																	// Reset base if it was removed
																	if (currentBase === langCode) {
																		const remaining = (values[localesField.key] as string[]) || [];
																		values.BASE_LOCALE = remaining[0] || 'en';
																	}
																}}
																aria-label="Remove {langCode}"
															>
																×
															</button>
														{/if}
													</span>
												{/each}
											{:else if localesField.placeholder}
												<span class="text-surface-500 dark:text-surface-400 text-xs">{localesField.placeholder}</span>
											{/if}

											{#if !localesField.readonly}
												<button
													type="button"
													class="preset-filled-surface-500 badge absolute right-2 top-2 rounded-full"
													onclick={() => {
														showLanguagePicker[localesField.key] = true;
														languageSearch[localesField.key] = '';
													}}
													aria-haspopup="dialog"
													aria-expanded={showLanguagePicker[localesField.key]}
													aria-controls="{localesField.key}-lang-picker"
												>
													<iconify-icon icon="mdi:plus" width="14"></iconify-icon>
													Add
												</button>
											{/if}
										</div>

										<!-- Language Picker Dropdown -->
										{#if showLanguagePicker[localesField.key]}
											<div
												id="{localesField.key}-lang-picker"
												class="absolute left-0 top-full z-20 mt-2 w-64 rounded-md border border-slate-300/60 bg-surface-50 p-2 shadow-lg dark:border-slate-600 dark:bg-surface-800"
												role="dialog"
												aria-label="Add language"
												tabindex="-1"
											>
												<input
													class="mb-2 w-full rounded border border-slate-300/60 bg-transparent px-2 py-1 text-xs outline-none focus:border-primary-500 dark:border-slate-600"
													placeholder="Search..."
													bind:value={languageSearch[localesField.key]}
												/>
												<div class="max-h-48 overflow-auto">
													{#each allowedLocales.filter((code: string) => {
														const search = (languageSearch[localesField.key] || '').toLowerCase();
														const currentValues = (values[localesField.key] as string[]) || [];
														const langName = displayLanguage(code).toLowerCase();
														return !currentValues.includes(code) && (search === '' || langName.includes(search) || code
																	.toLowerCase()
																	.includes(search));
													}) as code}
														<button
															type="button"
															class="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-primary-500/10"
															onclick={() => {
																toggleLanguage(localesField.key, code);
																showLanguagePicker[localesField.key] = false;
																// Set as base if it's the first locale
																if (!(values[localesField.key] as string[])?.length || !values.BASE_LOCALE) {
																	values.BASE_LOCALE = code;
																}
															}}
														>
															<span>{displayLanguage(code)} ({code.toUpperCase()})</span>
															<iconify-icon icon="mdi:plus-circle-outline" width="14" class="text-primary-500"></iconify-icon>
														</button>
													{:else}
														<p class="px-1 py-2 text-center text-[11px] text-slate-500">No matches</p>
													{/each}
												</div>
											</div>
										{/if}
									</div>
									{#if errors[localesField.key]}
										<div class="mt-1 text-xs text-error-500">{errors[localesField.key]}</div>
									{/if}
									{#if localesField.placeholder}
										<p class="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Example: {localesField.placeholder}</p>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{:else}
				<!-- Default Grid Layout for Other Groups -->
				<div class="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
					{#each group.fields as field}
						<div
							class="space-y-2 overflow-visible max-w-full {field.type === 'array' ||
							field.type === 'password' ||
							field.type === 'language-multi' ||
							field.type === 'loglevel-multi'
								? 'lg:col-span-2'
								: ''}"
						>
							<label for={field.key} class="mb-2 block">
								<span class="flex items-center gap-2">
									<iconify-icon icon={getFieldIcon(field)} width="18" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
									<span class="text-sm font-semibold text-tertiary-500 dark:text-primary-500 md:text-base">{field.label}</span>
									{#if field.required}
										<span class="text-error-500">*</span>
									{/if}
									<!-- Info icon with tooltip -->
									<div class="group relative inline-block">
										<button
											type="button"
											class="text-surface-500 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-50 cursor-help"
											aria-label="Field information"
										>
											<iconify-icon icon="material-symbols:info-outline" width="16"></iconify-icon>
										</button>
										<!-- Tooltip Content -->
										<div
											class="pointer-events-none absolute bottom-full left-1/2 z-1000 mb-2 w-max max-w-[200px] -translate-x-1/2 rounded-md bg-black/90 px-3 py-2 text-xs leading-tight text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100 md:max-w-[250px]"
										>
											{field.description}
										</div>
									</div>
								</span>
							</label>

							<!-- Text Input -->
							{#if field.type === 'text'}
								<input
									id={field.key}
									type={field.key.toLowerCase().includes('email') || field.key === 'SMTP_USER' || field.label.toLowerCase().includes('email')
										? 'email'
										: 'text'}
									class="input w-full max-w-full min-h-[44px]"
									bind:value={values[field.key]}
									placeholder={field.placeholder}
									required={field.required}
									disabled={field.readonly}
									oninput={() => (errors[field.key] = '')}
								/>
								<!-- Number Input -->
							{:else if field.type === 'number'}
								<div class="input-group input-group-divider grid-cols-[1fr_auto] flex flex-col sm:flex-row max-w-full text-center sm:text-left">
									<input
										id={field.key}
										type="number"
										class="input w-full max-w-full min-h-[44px]"
										bind:value={values[field.key]}
										placeholder={field.placeholder}
										required={field.required}
										min={field.min}
										max={field.max}
										oninput={() => (errors[field.key] = '')}
									/>
									{#if field.unit}
										<div class="input-group-shim text-sm">
											{field.unit}
											{#if typeof values[field.key] === 'number' && field.unit === 'seconds'}
												<span class="ml-2 text-surface-500 dark:text-surface-400">
													({formatDuration(values[field.key] as number)})
												</span>
											{/if}
										</div>
									{/if}
								</div>

								<!-- Password Input -->
							{:else if field.type === 'password'}
								<div class="relative">
									<input
										id={field.key}
										type={showPassword[field.key] ? 'text' : 'password'}
										class="input w-full max-w-full min-h-[44px] pr-10"
										bind:value={values[field.key]}
										placeholder={field.placeholder}
										required={field.required}
										disabled={field.readonly}
										oninput={() => (errors[field.key] = '')}
										autocomplete="current-password"
									/>
									{#if !field.readonly}
										<button
											type="button"
											class="absolute right-2 top-1/2 -translate-y-1/2 text-surface-600 hover:text-surface-900 dark:text-surface-300 dark:hover:text-surface-50"
											onclick={() => (showPassword[field.key] = !showPassword[field.key])}
											aria-label={showPassword[field.key] ? 'Hide password' : 'Show password'}
										>
											<iconify-icon icon={showPassword[field.key] ? 'bi:eye-slash-fill' : 'bi:eye-fill'} width="20"></iconify-icon>
										</button>
									{/if}
								</div>

								<!-- Boolean Input -->
							{:else if field.type === 'boolean'}
								<label class="flex items-center space-x-2">
									<input
										id={field.key}
										type="checkbox"
										class="checkbox w-auto min-w-[20px] min-h-[20px]"
										checked={!!values[field.key]}
										onchange={(e) => {
											values[field.key] = (e.target as HTMLInputElement).checked;
											errors[field.key] = '';
										}}
									/>
									<span>Enable {field.label}</span>
								</label>
								<!-- Select Input -->
							{:else if field.type === 'select' && field.options}
								<select
									id={field.key}
									class="select w-full max-w-full min-h-[44px]"
									bind:value={values[field.key]}
									required={field.required}
									onchange={() => (errors[field.key] = '')}
								>
									<option value="">Select {field.label}...</option>
									{#each field.options as option}
										<option value={option.value}>{option.label}</option>
									{/each}
								</select>

								<!-- Array Input -->
							{:else if field.type === 'array'}
								<input
									id={field.key}
									type="text"
									class="input w-full max-w-full min-h-[44px]"
									value={getArrayValue(field.key)}
									placeholder={field.placeholder}
									required={field.required}
									oninput={(e) => {
										handleArrayInput(field, e);
										errors[field.key] = '';
									}}
								/>
								<p class="mt-1 text-xs text-surface-500 dark:text-surface-400">Enter values separated by commas</p>

								<!-- Language Multi-Select -->
							{:else if field.type === 'language-multi'}
								<!-- Language Multi-Select (Styled like SystemConfig.svelte) -->
								<div class="relative">
									<div
										class="flex min-h-10 flex-wrap gap-2 rounded border p-2 pr-16 {errors[field.key]
											? 'border-error-500 bg-error-50 dark:bg-error-900/20'
											: 'border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700/40'}"
									>
										{#if (values[field.key] as string[])?.length > 0}
											{#each values[field.key] as string[] as langCode}
												<span class="group preset-ghost-tertiary-500 badge inline-flex items-center gap-1 rounded-full dark:preset-ghost-primary-500">
													{displayLanguage(langCode)} ({langCode})
													{#if !field.readonly}
														<button
															type="button"
															class="opacity-60 transition hover:opacity-100"
															onclick={() => removeLanguage(field.key, langCode)}
															aria-label="Remove {langCode}"
														>
															×
														</button>
													{/if}
												</span>
											{/each}
										{:else if field.placeholder}
											<span class="text-surface-500 dark:text-surface-400 text-xs">{field.placeholder}</span>
										{/if}

										{#if !field.readonly}
											<button
												type="button"
												class="preset-filled-surface-500 badge absolute right-2 top-2 rounded-full"
												onclick={() => {
													showLanguagePicker[field.key] = true;
													languageSearch[field.key] = '';
												}}
												aria-haspopup="dialog"
												aria-expanded={showLanguagePicker[field.key]}
												aria-controls="{field.key}-lang-picker"
											>
												<iconify-icon icon="mdi:plus" width="14"></iconify-icon>
												Add
											</button>
										{/if}
									</div>

									<!-- Language Picker Dropdown -->
									{#if showLanguagePicker[field.key]}
										<div
											id="{field.key}-lang-picker"
											class="absolute left-0 top-full z-20 mt-2 w-64 rounded-md border border-slate-300/60 bg-surface-50 p-2 shadow-lg dark:border-slate-600 dark:bg-surface-800"
											role="dialog"
											aria-label="Add language"
											tabindex="-1"
										>
											<input
												class="mb-2 w-full rounded border border-slate-300/60 bg-transparent px-2 py-1 text-xs outline-none focus:border-primary-500 dark:border-slate-600"
												placeholder="Search..."
												bind:value={languageSearch[field.key]}
											/>
											<div class="max-h-48 overflow-auto">
												{#each iso6391.filter((lang: { code: string; name: string; native: string }) => {
													const search = (languageSearch[field.key] || '').toLowerCase();
													const currentValues = (values[field.key] as string[]) || [];
													return !currentValues.includes(lang.code) && (search === '' || lang.name.toLowerCase().includes(search) || lang.native
																.toLowerCase()
																.includes(search) || lang.code.toLowerCase().includes(search));
												}) as lang}
													<button
														type="button"
														class="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-primary-500/10"
														onclick={() => {
															toggleLanguage(field.key, lang.code);
															showLanguagePicker[field.key] = false;
														}}
													>
														<span>{lang.native} ({lang.code})</span>
														<iconify-icon icon="mdi:plus-circle-outline" width="14" class="text-primary-500"></iconify-icon>
													</button>
												{:else}
													<p class="px-1 py-2 text-center text-[11px] text-slate-500">No matches</p>
												{/each}
											</div>
										</div>
									{/if}
								</div>
								{#if field.placeholder && (values[field.key] as string[])?.length > 0}
									<p class="text-surface-500 dark:text-surface-400 mt-1 text-[10px]">Example: {field.placeholder}</p>
								{/if}

								<!-- Log Level Multi-Select -->
							{:else if field.type === 'loglevel-multi'}
								<div class="relative">
									<div
										class="flex min-h-10 flex-wrap gap-2 rounded border p-2 pr-16 {errors[field.key]
											? 'border-error-500 bg-error-50 dark:bg-error-900/20'
											: 'border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700/40'}"
									>
										{#if (values[field.key] as LogLevel[])?.length > 0}
											{#each values[field.key] as LogLevel[] as level}
												<span class="group preset-ghost-tertiary-500 badge inline-flex items-center gap-1 rounded-full dark:preset-ghost-primary-500">
													{level}
													{#if !field.readonly}
														<button
															type="button"
															class="opacity-60 transition hover:opacity-100"
															onclick={() => removeLogLevel(field.key, level)}
															aria-label="Remove {level}"
														>
															×
														</button>
													{/if}
												</span>
											{/each}
										{:else if field.placeholder}
											<span class="text-surface-500 dark:text-surface-400 text-xs">{field.placeholder}</span>
										{/if}

										{#if !field.readonly}
											<button
												type="button"
												class="preset-filled-surface-500 badge absolute right-2 top-2 rounded-full"
												onclick={() => (showLogLevelPicker[field.key] = true)}
												aria-haspopup="dialog"
												aria-expanded={showLogLevelPicker[field.key]}
												aria-controls="{field.key}-loglevel-picker"
											>
												<iconify-icon icon="mdi:plus" width="14"></iconify-icon>
												Add
											</button>
										{/if}
									</div>

									<!-- Log Level Picker Dropdown -->
									{#if showLogLevelPicker[field.key]}
										<div
											id="{field.key}-loglevel-picker"
											class="absolute left-0 top-full z-20 mt-2 w-64 rounded-md border border-slate-300/60 bg-surface-50 p-2 shadow-lg dark:border-slate-600 dark:bg-surface-800"
											role="dialog"
											aria-label="Add log level"
											tabindex="-1"
										>
											<div class="max-h-48 overflow-auto">
												{#each LOG_LEVELS as level}
													{@const currentValues = (values[field.key] as LogLevel[]) || []}
													{#if !currentValues.includes(level)}
														<button
															type="button"
															class="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs capitalize hover:bg-primary-500/10"
															onclick={() => {
																toggleLogLevel(field.key, level);
																showLogLevelPicker[field.key] = false;
															}}
														>
															<span>{level}</span>
															<iconify-icon icon="mdi:plus-circle-outline" width="14" class="text-primary-500"></iconify-icon>
														</button>
													{/if}
												{/each}
											</div>
										</div>
									{/if}
								</div>
								{#if field.placeholder && (values[field.key] as LogLevel[])?.length > 0}
									<p class="text-surface-500 dark:text-surface-400 mt-1 text-[10px]">Example: {field.placeholder}</p>
								{/if}
							{/if}

							<!-- Field Error -->
							{#if errors[field.key]}
								<p class="mt-1 text-sm text-error-500">{errors[field.key]}</p>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			<!-- Actions -->
			<div class="flex flex-col justify-between gap-2 pt-4 sm:flex-row max-w-full overflow-visible">
				<button
					type="button"
					class="preset-filled-surface-500 btn w-full sm:w-auto min-w-fit px-4 sm:min-h-[48px]"
					onclick={resetToDefaults}
					disabled={saving}
				>
					<span>🔄</span>
					<span>Reset to Defaults</span>
				</button>

				<button type="submit" class="preset-filled-primary-500 btn w-full sm:w-auto min-w-fit px-4 sm:min-h-[48px]" disabled={saving}>
					{#if saving}
						<span>Saving...</span>
					{:else}
						<span>💾</span>
						<span>Save Changes</span>
					{/if}
				</button>
			</div>
		</form>
	{/if}
</div>
