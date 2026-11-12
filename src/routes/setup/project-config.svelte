<!--
@file src/routes/setup/project-config.svelte
@component
**Project Blueprint step for the setup wizard.**

Lets the operator pick a starting blueprint and set the regional defaults (country,
currency, and suggested tax rates) that the Review step prints.

Features:
- Preset carousel bound to `systemSettings.preset`
- Market block shown for every blueprint, because Review always prints these values
- Country selection applies suggested currency, tax rates, and shop language
- RTL-safe logical properties, status-shade contract, native `@components/ui` controls
-->
<script lang="ts">
	import Checkbox from '@components/ui/checkbox.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
	import { setup_presets_helper } from '@src/paraglide/messages';
	import type { SystemSettings } from '@src/stores/setup-store.svelte.ts';
	import { countryOptions, suggestMarket } from '@src/services/setup/market';
	import PresetSelector from './preset-selector.svelte';
	import { PRESET_METADATA } from '@src/services/setup/preset-meta';

	// --- PROPS ---
	let { systemSettings = $bindable() }: { systemSettings: SystemSettings } = $props();

	const presets = PRESET_METADATA;
	const countryChoices = countryOptions();

	// The market block used to be gated on `preset === 'ecommerce'`, but Review prints
	// country, currency, shop language and tax for EVERY blueprint — so a `website` run
	// showed the seeded DE/EUR/19%/7% with no way to edit them (SV-036). It is always
	// shown now; only the explanatory copy changes for non-commerce blueprints.
	const isCommerce = $derived(systemSettings.preset === 'ecommerce');

	function applyCountry(code: string) {
		const suggestion = suggestMarket(code, systemSettings.defaultContentLanguage);
		systemSettings.homeCountry = code;
		systemSettings.currency = suggestion.currency;
		systemSettings.pricesIncludeTax = suggestion.pricesIncludeTax;
		systemSettings.storeLanguage = suggestion.storeLanguage;
		systemSettings.taxRate = suggestion.taxRate == null ? '' : String(suggestion.taxRate);
		systemSettings.reducedRate =
			suggestion.reducedRate == null ? '' : String(suggestion.reducedRate);
	}
</script>

<div class="fade-in w-full min-w-0">
	<div class="mb-6">
		<p class="text-sm text-center text-tertiary-600 dark:text-primary-400 sm:text-base">
			{setup_presets_helper()}
		</p>
	</div>

	<section class="mb-2">
		<PresetSelector {presets} bind:selected={systemSettings.preset} />
	</section>

	<section
		class="mt-4 space-y-4 border-t border-(--admin-border-default) pt-4"
		aria-labelledby="market-heading"
	>
		<div>
			<h2 id="market-heading" class="font-medium">Country and market defaults</h2>
			<p class="mt-1 text-xs leading-relaxed text-tertiary-600 dark:text-primary-400">
				{#if isCommerce}
					Pick a country to fill currency, shop language, and a suggested tax rate. Edit every
					value. Leave the country empty and no tax row is created. Suggested rates were checked on
					5 October 2026. They are a starting point, not a tax ruling.
				{:else}
					Review lists these regional values for every blueprint. Pick a country to fill currency,
					shop language, and a suggested tax rate — or leave them as they are if this blueprint
					ships no catalog or checkout. Suggested rates were checked on 5 October 2026. They are a
					starting point, not a tax ruling.
				{/if}
			</p>
		</div>
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<Select
				id="home-country"
				label="Country"
				bind:value={systemSettings.homeCountry}
				options={countryChoices}
				onchange={applyCountry}
			/>
			<Input
				id="market-currency"
				label="Currency"
				bind:value={systemSettings.currency}
				maxlength={3}
				autocomplete="off"
			/>
			<Select
				id="store-language"
				label="Shop language"
				bind:value={systemSettings.storeLanguage}
				options={[
					{ value: 'en', label: 'English' },
					{ value: 'de', label: 'German' }
				]}
			/>
			<Checkbox
				bind:checked={systemSettings.pricesIncludeTax}
				label="Prices include tax"
				description="Catalog prices are the amount the buyer pays. Tax is extracted, not added."
			/>
			<Input
				id="tax-rate"
				label="Standard tax %"
				bind:value={systemSettings.taxRate}
				inputmode="decimal"
				autocomplete="off"
			/>
			<Input
				id="reduced-rate"
				label="Reduced tax %"
				bind:value={systemSettings.reducedRate}
				inputmode="decimal"
				autocomplete="off"
			/>
		</div>
	</section>
</div>
