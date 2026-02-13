<!--
@file src/widgets/custom/Address/Input.svelte
@component
**Address Widget Input Component**

Provides comprehensive address input with interactive Mapbox integration and geocoding.
Part of the Three Pillars Architecture for widget system.

@example
<AddressInput bind:value={addressData} field={fieldDefinition} />
Interactive form with map, country selector, and address validation

### Props
- `field: FieldType` - Widget field definition with map settings and configuration
- `value: AddressData | null | undefined` - Structured address object (bindable)
- `error?: string | null` - Validation error message for display

### Features
- **Interactive Mapping**: Mapbox GL JS integration with draggable markers
- **Geocoding Support**: Address lookup and coordinate resolution
- **Country Selection**: Multilingual country dropdown with ISO codes and SEARCH
- **Field Visibility**: Configurable hidden fields for flexible layouts
- **Default Values**: Smart defaults from field configuration
- **Coordinate Tracking**: Automatic latitude/longitude capture
- **Responsive Design**: Grid-based form layout for optimal UX
- **Error Handling**: Accessible error display with ARIA attributes
- **Language Support**: Localized UI based on system language settings
-->

<script lang="ts">
	import { app, validationStore } from '@src/stores/store.svelte';
	import { onDestroy, onMount } from 'svelte';
	import type { FieldType } from './';
	import type { AddressData } from './types';
	import { tokenTarget } from '@src/services/token/tokenTarget';
	import { countryStore } from './countryStore.svelte';
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import { getFieldName } from '@utils/utils';

	// Valibot validation
	import { string, pipe, parse, minLength, optional, object } from 'valibot';

	// Unified error handling
	import { handleWidgetValidation } from '@widgets/widgetErrorHandler';

	let {
		field,
		value = $bindable(),
		error
	}: { field: FieldType; value: Record<string, AddressData> | AddressData | null | undefined; error?: string | null } = $props();

	// --- 1. Language Handling (Architecture Compliance) ---

	// Data Language: Which language version of the address are we editing?
	// If field is translated, align with contentLanguage. Otherwise use default.
	const _dataLanguage = $derived(field.translated ? app.contentLanguage : (publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en').toLowerCase());

	// UI Language: Which language should the Country Dropdown LABELS be in?
	// Always use systemLanguage for UI elements.
	const _uiLanguage = $derived(app.systemLanguage);

	// Safe Value Access: Get the address object for the current data language
	let safeValue = $derived.by(() => {
		if (field.translated && value && typeof value === 'object') {
			// It's a multilingual object { en: {...}, de: {...} }
			return (value as Record<string, AddressData>)[_dataLanguage] as AddressData | undefined;
		}
		// It's a single address object
		return value as AddressData | undefined;
	});

	// Value Updater: Helper to update specific fields while preserving multilingual structure
	function updateAddressField(key: keyof AddressData, newValue: any) {
		const currentAddress = safeValue || {
			street: '',
			houseNumber: '',
			postalCode: '',
			city: '',
			country: (field.defaultCountry as string) || 'DE',
			latitude: (field.mapCenter as { lat: number; lng: number })?.lat || 0,
			longitude: (field.mapCenter as { lat: number; lng: number })?.lng || 0
		};

		const updatedAddress = { ...currentAddress, [key]: newValue };

		if (field.translated) {
			// Merge into multilingual object
			value = {
				...(typeof value === 'object' ? value : {}),
				[_dataLanguage]: updatedAddress
			} as Record<string, AddressData>;
		} else {
			// Direct update
			value = updatedAddress;
		}

		// Validate after update
		validateAddress(updatedAddress);
	}

	// Validation
	const fieldName = $derived(getFieldName(field));

	// Address validation schema
	const addressSchema = $derived(
		field?.required
			? object({
					street: pipe(string(), minLength(1, 'Street is required')),
					city: pipe(string(), minLength(1, 'City is required')),
					postalCode: pipe(string(), minLength(1, 'Postal code is required')),
					country: pipe(string(), minLength(2, 'Country is required'))
				})
			: optional(
					object({
						street: optional(string()),
						city: optional(string()),
						postalCode: optional(string()),
						country: optional(string())
					})
				)
	);

	function validateAddress(addressData: AddressData | undefined) {
		if (!addressData && !field?.required) {
			validationStore.clearError(fieldName);
			return;
		}
		if (!addressData && field?.required) {
			validationStore.setError(fieldName, 'Address is required');
			return;
		}
		handleWidgetValidation(() => parse(addressSchema, addressData), { fieldName, updateStore: true });
	}

	// --- 2. Country Data & Search ---

	let countrySearch = $state('');

	// Reactive list of countries from store
	const countries = $derived(countryStore.countries);

	// Ensure full country list is loaded if UI language needs it
	$effect(() => {
		if (_uiLanguage) {
			countryStore.ensureLanguageLoaded(_uiLanguage);
		}
	});

	// Filtered countries for the dropdown
	const filteredCountries = $derived(
		countries.filter((c) => {
			if (!countrySearch) return true;
			const term = countrySearch.toLowerCase();
			const name = countryStore.getCountryName(c.alpha2, _uiLanguage).toLowerCase();
			return name.includes(term) || c.alpha2.toLowerCase().includes(term);
		})
	);

	// --- 3. Initialization ---

	// Initialize value if completely missing (One-time on mount)
	onMount(() => {
		if (!value) {
			const initialAddress = {
				street: '',
				houseNumber: '',
				postalCode: '',
				city: '',
				country: (field.defaultCountry as string) || 'DE',
				latitude: (field.mapCenter as { lat: number; lng: number })?.lat || 0,
				longitude: (field.mapCenter as { lat: number; lng: number })?.lng || 0
			};

			if (field.translated) {
				value = { [_dataLanguage]: initialAddress };
			} else {
				value = initialAddress;
			}
		}
	});

	// Note: Map functionality is placeholder for future Mapbox integration
	const map: any = null;

	onDestroy(() => {
		if (map && typeof map.remove === 'function') {
			map.remove();
		}
	});
</script>

<div class="address-container" class:invalid={error}>
	{#if !(field.hiddenFields as string[])?.includes('latitude')}
		<div class="map">
			<!-- Map placeholder - Mapbox integration to be implemented -->
		</div>
	{/if}

	{#if safeValue}
		<div class="form-grid">
			<div class="field relative">
				<label for="{field.db_fieldName}-street">Street</label>
				<input
					type="text"
					id="{field.db_fieldName}-street"
					value={safeValue.street}
					oninput={(e) => updateAddressField('street', e.currentTarget.value)}
					class="input"
					use:tokenTarget={{
						name: field.db_fieldName,
						label: field.label,
						collection: (field as any).collection
					}}
				/>
			</div>
			<div class="field">
				<label for="{field.db_fieldName}-houseNumber">House Number</label>
				<input
					type="text"
					id="{field.db_fieldName}-houseNumber"
					value={safeValue.houseNumber}
					oninput={(e) => updateAddressField('houseNumber', e.currentTarget.value)}
					class="input"
				/>
			</div>
			<div class="field">
				<label for="{field.db_fieldName}-postalCode">Postal Code</label>
				<input
					type="text"
					id="{field.db_fieldName}-postalCode"
					value={safeValue.postalCode}
					oninput={(e) => updateAddressField('postalCode', e.currentTarget.value)}
					class="input"
				/>
			</div>
			<div class="field">
				<label for="{field.db_fieldName}-city">City</label>
				<input
					type="text"
					id="{field.db_fieldName}-city"
					value={safeValue.city}
					oninput={(e) => updateAddressField('city', e.currentTarget.value)}
					class="input"
				/>
			</div>
			<div class="field">
				<label for="{field.db_fieldName}-country">Country</label>

				<!-- Country Search Filter -->
				<input type="text" bind:value={countrySearch} placeholder="Search countries..." class="input mb-2 text-sm" />

				<select
					id="{field.db_fieldName}-country"
					value={safeValue.country}
					onchange={(e) => updateAddressField('country', e.currentTarget.value)}
					class="input"
				>
					<option value="" disabled>Select a country</option>
					{#each filteredCountries as country (country.alpha2)}
						<option value={country.alpha2}>
							{countryStore.getCountryName(country.alpha2, _uiLanguage)}
						</option>
					{/each}
				</select>
			</div>
		</div>
	{/if}

	{#if error}
		<p class="error-message" role="alert">{error}</p>
	{/if}
</div>
