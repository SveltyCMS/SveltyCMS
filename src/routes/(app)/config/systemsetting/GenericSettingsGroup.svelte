<!--
@component GenericSettingsGroup.svelte
@description Generic component for rendering any settings group
Handles all field types and validation automatically
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { SettingGroup, SettingField } from './settingsGroups';

	export let group: SettingGroup;

	let loading = false;
	let saving = false;
	let error: string | null = null;
	let success: string | null = null;
	let values: Record<string, unknown> = {};
	let errors: Record<string, string> = {};

	// Load current values
	async function loadSettings() {
		loading = true;
		error = null;

		try {
			// Load values from API
			const response = await fetch(`/api/settings/${group.id}`);
			const data = await response.json();

			// Debug logging
			console.log(`[${group.id}] API Response:`, data);
			console.log(`[${group.id}] Values received:`, data.values);

			if (data.success) {
				values = data.values || {};
				console.log(`[${group.id}] Values set to:`, values);
			} else {
				throw new Error(data.error || 'Failed to load settings');
			}
		} catch (err) {
			console.error(`[${group.id}] Load error:`, err);
			error = err instanceof Error ? err.message : 'Failed to load settings';
		} finally {
			loading = false;
		}
	}

	// Validate a single field
	function validateField(field: SettingField, value: unknown): string | null {
		// Required check
		if (field.required && (value === undefined || value === null || value === '')) {
			return `${field.label} is required`;
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
		success = null;

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
				success = `${group.name} settings saved successfully!`;
				if (group.requiresRestart) {
					success += ' Server restart required for changes to take effect.';
				}
				await loadSettings();
			} else {
				error = data.error || 'Failed to save settings';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save settings';
		} finally {
			saving = false;
		}
	}

	// Reset to defaults
	async function resetToDefaults() {
		if (!confirm(`Reset all ${group.name} settings to defaults?`)) return;

		saving = true;
		error = null;
		success = null;

		try {
			const response = await fetch(`/api/settings/${group.id}`, {
				method: 'DELETE'
			});

			const data = await response.json();

			if (data.success) {
				success = `${group.name} settings reset to defaults!`;
				await loadSettings();
			} else {
				error = data.error || 'Failed to reset settings';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to reset settings';
		} finally {
			saving = false;
		}
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

	onMount(() => {
		loadSettings();
	});
</script>

<div class="generic-settings-group">
	<!-- Header -->
	<div class="header mb-6">
		<h2 class="h3 mb-2">
			<span class="mr-2 text-2xl">{group.icon}</span>
			{group.name}
		</h2>
		<p class="text-surface-600-300-token">{group.description}</p>
	</div>

	<!-- Restart Warning -->
	{#if group.requiresRestart}
		<div class="alert variant-filled-warning mb-4">
			<div class="alert-message">
				<strong>⚠️ Restart Required</strong>
				<p>Changes to these settings require a server restart to take effect.</p>
			</div>
		</div>
	{/if}

	<!-- Loading State -->
	{#if loading}
		<div class="card variant-soft-surface p-6 text-center">
			<p>Loading settings...</p>
		</div>
	{:else}
		<!-- Error Message -->
		{#if error}
			<div class="alert variant-filled-error mb-4">
				<div class="alert-message">
					<strong>Error</strong>
					<p>{error}</p>
				</div>
			</div>
		{/if}

		<!-- Success Message -->
		{#if success}
			<div class="alert variant-filled-success mb-4">
				<div class="alert-message">
					<strong>Success</strong>
					<p>{success}</p>
				</div>
			</div>
		{/if}

		<!-- Settings Form -->
		<form on:submit|preventDefault={saveSettings} class="space-y-4 md:space-y-6">
			<div class="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
				{#each group.fields as field}
					<div class="form-field" class:lg:col-span-2={field.type === 'array' || field.type === 'password'}>
						<label for={field.key} class="label">
							<span class="text-sm font-semibold md:text-base">{field.label}</span>
							{#if field.required}
								<span class="text-error-500">*</span>
							{/if}
						</label>

						<p class="text-surface-600-300-token mb-2 text-xs md:text-sm">
							{field.description}
						</p>

						<!-- Text Input -->
						{#if field.type === 'text'}
							<input
								id={field.key}
								type="text"
								class="input"
								bind:value={values[field.key]}
								placeholder={field.placeholder}
								required={field.required}
								on:input={() => (errors[field.key] = '')}
							/>

							<!-- Number Input -->
						{:else if field.type === 'number'}
							<div class="input-group input-group-divider grid-cols-[1fr_auto]">
								<input
									id={field.key}
									type="number"
									class="input"
									bind:value={values[field.key]}
									placeholder={field.placeholder}
									required={field.required}
									min={field.min}
									max={field.max}
									on:input={() => (errors[field.key] = '')}
								/>
								{#if field.unit}
									<div class="input-group-shim text-sm">
										{field.unit}
										{#if typeof values[field.key] === 'number' && field.unit === 'seconds'}
											<span class="text-surface-500-400-token ml-2">
												({formatDuration(values[field.key] as number)})
											</span>
										{/if}
									</div>
								{/if}
							</div>

							<!-- Password Input -->
						{:else if field.type === 'password'}
							<input
								id={field.key}
								type="password"
								class="input"
								bind:value={values[field.key]}
								placeholder={field.placeholder}
								required={field.required}
								on:input={() => (errors[field.key] = '')}
							/>

							<!-- Boolean Input -->
						{:else if field.type === 'boolean'}
							<label class="flex items-center space-x-2">
								<input
									id={field.key}
									type="checkbox"
									class="checkbox"
									checked={!!values[field.key]}
									on:change={(e) => {
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
								class="select"
								bind:value={values[field.key]}
								required={field.required}
								on:change={() => (errors[field.key] = '')}
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
								class="input"
								value={getArrayValue(field.key)}
								placeholder={field.placeholder}
								required={field.required}
								on:input={(e) => {
									handleArrayInput(field, e);
									errors[field.key] = '';
								}}
							/>
							<p class="text-surface-500-400-token mt-1 text-xs">Enter values separated by commas</p>
						{/if}

						<!-- Field Error -->
						{#if errors[field.key]}
							<p class="mt-1 text-sm text-error-500">{errors[field.key]}</p>
						{/if}
					</div>
				{/each}
			</div>

			<!-- Actions -->
			<div class="actions-container flex flex-col gap-2 pt-4 sm:flex-row sm:flex-wrap">
				<button type="submit" class="variant-filled-primary btn w-full sm:w-auto" disabled={saving}>
					{#if saving}
						<span>Saving...</span>
					{:else}
						<span>💾</span>
						<span>Save Changes</span>
					{/if}
				</button>

				<button type="button" class="variant-filled-surface btn w-full sm:w-auto" on:click={resetToDefaults} disabled={saving}>
					<span>🔄</span>
					<span>Reset to Defaults</span>
				</button>

				<button type="button" class="variant-filled-secondary btn w-full sm:w-auto" on:click={loadSettings} disabled={saving || loading}>
					<span>↻</span>
					<span>Reload</span>
				</button>
			</div>
		</form>
	{/if}
</div>

<style lang="postcss">
	.generic-settings-group {
		@apply space-y-4;
		/* Prevent horizontal overflow */
		max-width: 100%;
		overflow-x: hidden;
	}

	.header h2 {
		@apply text-xl md:text-2xl;
	}

	.alert {
		@apply p-3 rounded-container-token md:p-4;
	}

	.alert-message strong {
		@apply mb-1 block text-sm md:text-base;
	}

	.alert-message p {
		@apply text-xs md:text-sm;
	}

	.form-field {
		@apply space-y-2;
		/* Prevent input overflow */
		max-width: 100%;
	}

	.label {
		@apply mb-2 block;
	}

	.input,
	.select {
		@apply w-full;
		/* Better touch targets on mobile */
		min-height: 44px;
		/* Prevent overflow */
		max-width: 100%;
	}

	.checkbox {
		@apply w-auto;
		/* Better touch target */
		min-width: 20px;
		min-height: 20px;
	}

	/* Touch-friendly spacing for mobile */
	@media (max-width: 640px) {
		.form-field {
			@apply space-y-3;
		}

		.actions-container button {
			/* Full width on mobile for easier tapping */
			@apply min-h-[48px];
		}
	}

	/* Input group responsiveness */
	.input-group {
		@apply flex-col sm:flex-row;
		/* Prevent overflow */
		max-width: 100%;
	}

	.input-group-shim {
		@apply text-center sm:text-left;
	}
</style>
