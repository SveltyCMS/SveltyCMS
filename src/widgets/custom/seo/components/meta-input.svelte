<!--
@file src/widgets/custom/seo/components/MetaInput.svelte
@component
Reusable character-counted input for SEO meta fields (title, description).
Replaces the now-removed TitleInput.svelte and DescriptionInput.svelte.

#### Props
- `value`         {string}   - Bound field value
- `id`            {string}   - Input element id
- `label`         {string}   - Visible label text
- `placeholder`   {string}   - Input placeholder
- `type`          {'input' | 'textarea'} - Render mode
- `rows`          {number}   - Textarea rows (default 2)
- `optimalMin`    {number}   - Lower bound of optimal range (green)
- `optimalMax`    {number}   - Upper bound of optimal range (green)
- `warnMin`       {number}   - Lower bound of warning range (orange)
- `warnMax`       {number}   - Upper bound of warning range (orange)
- `desktopPx`     {number}   - Pixel width reference for desktop label
- `mobilePx`      {number}   - Pixel width reference for mobile label
- `characterWidth`{number}   - Computed pixel width of the current value
- `onChange`      {fn}       - Called with new string value on every input
-->

<script lang="ts">
	import Input from '@components/ui/input.svelte';
	import Textarea from '@components/ui/textarea.svelte';
	import {
		widget_seo_suggestioncharacter,
		widget_seo_suggestionwidthdesktop,
		widget_seo_suggestionwidthmobile
	} from '@src/paraglide/messages';

	interface Props {
		characterWidth?: number;
		desktopPx?: number;
		id: string;
		label: string;
		mobilePx?: number;
		onChange?: (v: string) => void;
		optimalMax?: number;
		optimalMin?: number;
		placeholder?: string;
		rows?: number;
		type?: 'input' | 'textarea';
		value: string;
		warnMax?: number;
		warnMin?: number;
	}

	let {
		id,
		label,
		value = $bindable(),
		placeholder = '',
		type = 'input',
		rows = 2,
		optimalMin = 0,
		optimalMax = 999,
		warnMin = 0,
		warnMax = 0,
		desktopPx,
		mobilePx,
		characterWidth = 0,
		onChange
	}: Props = $props();

	// Reactive colour class – single source of truth
	const colorClass = $derived(
		value.length >= optimalMin && value.length <= optimalMax
			? 'label-optimal'
			: value.length >= warnMin && value.length <= warnMax
				? 'label-warn'
				: value.length < warnMin
					? 'label-default'
					: 'label-over'
	);

	const statusText = $derived(
		value.length >= optimalMin && value.length <= optimalMax
			? 'Optimal length'
			: value.length >= warnMin && value.length <= warnMax
				? 'Length is acceptable'
				: value.length < warnMin
					? 'Too short'
					: 'Too long'
	);

	const statusId = $derived(`${id}-status`);

	function handleInput(e: Event) {
		const v = (e.currentTarget as HTMLInputElement | HTMLTextAreaElement).value;
		value = v;
		onChange?.(v);
	}
</script>

<label for={id} class="label {colorClass}">
	<div class="flex items-center justify-between">
		<div class="text-black dark:text-white">{label}</div>
		<div class="flex flex-col text-xs sm:flex-row sm:text-base gap-x-2">
			<span>
				{widget_seo_suggestioncharacter()}
				<span class="text-tertiary-500 dark:text-primary-500">{value.length}</span>
			</span>
			{#if desktopPx && mobilePx}
				<span>
					{widget_seo_suggestionwidthdesktop()}
					<span class="text-tertiary-500 dark:text-primary-500">{characterWidth}</span>/{desktopPx}px
					{widget_seo_suggestionwidthmobile()}
					<span class="text-tertiary-500 dark:text-primary-500">{characterWidth}</span>/{mobilePx}px
				</span>
			{/if}
		</div>
	</div>
	<div id={statusId} class="status-msg" aria-live="polite">{statusText}</div>
</label>

{#if type === 'textarea'}
	<Textarea
		aria-label={statusText}
		{id}
		name={id}
		{placeholder}
		{rows}
		bind:value
		oninput={handleInput}
		class="space-y-0"
		textareaClass="text-black dark:text-primary-500"
		aria-describedby={statusId}
	/>
{:else}
	<Input
		aria-label="form input"
		{id}
		type="text"
		{placeholder}
		bind:value
		oninput={handleInput}
		class="space-y-0"
		inputClass="text-black dark:text-primary-500"
		aria-describedby={statusId}
	/>
{/if}

<style>
	.label-optimal { color: green; }
	.label-warn    { color: orange; }
	.label-default { color: gray; }
	.label-over    { color: red; }
	.status-msg    { margin-top: 0.25rem; font-size: 0.875rem; }
</style>
