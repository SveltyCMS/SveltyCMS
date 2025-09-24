<!--
@file src/widgets/custom/address/Display.svelte
@component
**Address Widget Display Component**

Renders structured address data as formatted, human-readable address strings.
Part of the Three Pillars Architecture for enterprise-ready widget system.

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
-->

<script lang="ts">
	import type { AddressData } from './types';

	let { value }: { value: AddressData | null | undefined } = $props();

	// Create a formatted address string from the data object.
	const formattedAddress = $derived.by(() => {
		if (!value?.street) return '–';
		const parts = [`${value.street} ${value.houseNumber}`, `${value.postalCode} ${value.city}`, value.country];
		return parts.filter(Boolean).join(', ');
	});
</script>

<span title={formattedAddress}>{formattedAddress}</span>
