<!--
@file src/widgets/custom/Address/Display.svelte
@component
**Address Widget Display Component**

Renders structured address data as formatted, human-readable address strings.
Part of the Three Pillars Architecture for widget system.

@example
<AddressDisplay value={{ street: "Main St", houseNumber: "123", city: "Berlin", country: "DE" }} />
Renders: "Main St 123, 12345 Berlin, Germany"

### Props
- `value: AddressData | null | undefined` - Structured address object with street, city, etc.

### Features
- **Smart Formatting**: Combines address components into readable format
- **Null Handling**: Graceful fallback to "–" for empty or incomplete addresses
- **Tooltip Support**: Full address available on hover via title attribute
- **Flexible Structure**: Handles partial address data gracefully
- **International Support**: Works with various address formats and countries
- **Performance Optimized**: Efficient string concatenation with `$derived.by()`
- **Clean Output**: Filters empty components for clean display
- **Architecture Compliance**: Full multilingual data support
-->

<script lang="ts">
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import { app } from '@src/stores/store.svelte';
	import type { FieldType } from './';
	import { countryStore } from './countryStore.svelte';
	import type { AddressData } from './types';

	let { field, value }: { field: FieldType; value: Record<string, AddressData> | AddressData | null | undefined } = $props();

	// 1. Language Handling
	// Resolve the correct data object based on translation status and content language
	const safeValue = $derived.by(() => {
		if (!value) return null;

		if (field.translated && typeof value === 'object') {
			// Multilingual mode: Try current content language, fallback to default
			const lang = app.contentLanguage;
			const defaultLang = (publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en').toLowerCase();
			return ((value as Record<string, AddressData>)[lang] || (value as Record<string, AddressData>)[defaultLang] || Object.values(value)[0]) as
				| AddressData
				| undefined;
		}

		// Single value mode
		return value as AddressData;
	});

	// UI Language for country name translation
	const uiLang = $derived(app.systemLanguage);

	// Create a formatted address string from the data object.
	const formattedAddress = $derived.by(() => {
		if (!safeValue?.street) return '–';

		// Resolve country name from store using UI language
		const countryName = safeValue.country ? countryStore.getCountryName(safeValue.country, uiLang) : '';

		const parts = [`${safeValue.street} ${safeValue.houseNumber}`, `${safeValue.postalCode} ${safeValue.city}`, countryName];
		return parts.filter(Boolean).join(', ');
	});
</script>

<span title={formattedAddress}>{formattedAddress}</span>
