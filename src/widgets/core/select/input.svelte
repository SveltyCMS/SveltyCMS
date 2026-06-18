<!--
@file src/widgets/custom/select/input.svelte
@component
**Select Widget Input Component**
-->

<script lang="ts">
	import Select from '@components/ui/select.svelte';
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { app } from '@src/stores/store.svelte';
	import type { SelectOption } from './types';

	interface Props {
		field: any;
		value: string | number | null | undefined | Record<string, any>;
		error?: string | null;
	}

	let { field, value = $bindable(), error }: Props = $props();

	const LANGUAGE = $derived(field.translated ? app.contentLanguage : ((publicEnv.DEFAULT_CONTENT_LANGUAGE as string) || 'en').toLowerCase());

	// Local state to bind the select to
	let localValue = $state<string>('');

	// Normalize options
	const normalizedOptions = $derived(
		(field.options || []).map((opt: string | SelectOption) => {
			if (typeof opt === 'string') {
				return { label: opt, value: opt };
			}
			return opt;
		})
	);

	const selectOptions = $derived(
		normalizedOptions.map((opt: SelectOption) => ({
			value: String(opt.value),
			label: opt.label
		}))
	);

	// Sync localValue from parent value
	$effect(() => {
		const parentVal = value;
		let extracted = '';

		if (field.translated && typeof parentVal === 'object' && parentVal !== null) {
			const raw = (parentVal as Record<string, any>)[LANGUAGE];
			extracted = raw == null ? '' : String(raw);
		} else if (!field.translated && (typeof parentVal === 'string' || typeof parentVal === 'number')) {
			extracted = String(parentVal);
		}

		if (extracted !== localValue) {
			localValue = extracted;
		}
	});

	// Update parent value when localValue changes
	function updateParent(newVal: string) {
		const parsedVal = newVal === '' ? null : newVal;
		if (field.translated) {
			if (!value || typeof value !== 'object') {
				value = {};
			}
			value = { ...(value as object), [LANGUAGE]: parsedVal };
		} else {
			value = parsedVal;
		}
	}
</script>

<div class="relative mb-4 w-full">
	<Select
		bind:value={localValue}
		label={field.label}
		placeholder={field.placeholder || 'Select an option...'}
		options={selectOptions}
		allowEmptySelection
		required={field.required}
		error={error || ''}
		invalid={!!error}
		onchange={updateParent}
	/>
</div>
