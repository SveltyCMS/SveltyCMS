<!--
@file src/routes/setup/project-config.svelte
@component
**Project Blueprint step for the setup wizard.**

Lets the operator pick a starting blueprint, and — only when that blueprint ships
commerce — set the market (country, currency, and suggested tax rates). Country data
lives here rather than the System step because it is only relevant to e-commerce setups.

Features:
- Preset carousel bound to `systemSettings.preset`
- Market block gated on commerce-capable blueprints (`ecommerce`)
- Country selection applies suggested currency, tax rates, and shop language
- RTL-safe logical properties, status-shade contract, native `@components/ui` controls
-->
<script lang="ts">
	import Checkbox from '@components/ui/checkbox.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
	import { setup_presets_helper } from '@src/paraglide/messages';
	import type { SystemSettings } from '@src/stores/setup-store.svelte.ts';
	import { countryOptions, suggestMarket } from './market';
	import PresetSelector from './preset-selector.svelte';
	import { PRESETS } from './presets';

	// --- PROPS ---
	let { systemSettings = $bindable() }: { systemSettings: SystemSettings } = $props();

	const presets = PRESETS;
	const countryChoices = countryOptions();

	// The market block (country, currency, tax) only applies when the chosen blueprint
	// includes commerce collections. Every other blueprint skips it entirely.
	const showMarket = $derived(systemSettings.preset === 'ecommerce');

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
		<p class="text-sm text-center text-tertiary-500 dark:text-primary-500 sm:text-base">
			{setup_presets_helper()}
		</p>
	</div>

	<section class="mb-2">
		<PresetSelector {presets} bind:selected={systemSettings.preset} />
	</section>

	{#if showMarket}
		<section
			class="mt-4 space-y-4 border-t border-surface-500/30 pt-4 dark:border-surface-500/30"
			aria-labelledby="market-heading"
		>
			<div>
				<h2 id="market-heading" class="font-medium">Country and prices</h2>
				<p class="mt-1 text-xs leading-relaxed text-tertiary-500 dark:text-primary-500">
					Pick a country to fill currency, shop language, and a suggested tax rate. Edit every
					value. Leave the country empty and no tax row is created. Suggested rates were checked on
					5 October 2026. They are a starting point, not a tax ruling.
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
	{/if}
</div>
