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
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { app } from '@src/stores/store.svelte';
	import type { FieldType } from './';
	import { countryStore } from './country-store.svelte';
	import type { AddressData } from './types';

	let {
		field,
		value
	}: {
		field: FieldType;
		value: Record<string, AddressData> | AddressData | null | undefined;
	} = $props();

	// 1. Language Handling
	// Resolve the correct data object based on translation status and content language
	const safeValue = $derived.by(() => {
		if (!value) {
			return null;
		}

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
</script>

{#if safeValue?.street}
	<div class="address-display flex flex-col text-sm leading-relaxed" title="{safeValue.street} {safeValue.houseNumber}, {safeValue.postalCode} {safeValue.city}">
		<div class="font-bold text-surface-900 dark:text-surface-50">
			{safeValue.street} {safeValue.houseNumber}
		</div>
		<div class="text-surface-600 dark:text-surface-400">
			{safeValue.postalCode} {safeValue.city}
		</div>
		<div class="flex items-center gap-1 text-xs text-surface-500">
			<iconify-icon icon="mdi:earth" width="12"></iconify-icon>
			{safeValue.country ? countryStore.getCountryName(safeValue.country, uiLang) : ''}
		</div>
		
		{#if (field as any).showCoordinates && safeValue.latitude !== undefined && safeValue.longitude !== undefined}
			<div class="mt-1 flex items-center gap-1 text-[10px] text-surface-400 font-mono italic">
				<iconify-icon icon="mdi:map-marker-outline" width="10"></iconify-icon>
				{safeValue.latitude.toFixed(5)}, {safeValue.longitude.toFixed(5)}
			</div>
		{/if}
	</div>
{:else}
	<span class="text-surface-400 dark:text-surface-600">–</span>
{/if}

<style>
	.address-display {
		min-width: 120px;
	}
</style>
