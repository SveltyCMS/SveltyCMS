<!--
@file src/components/system/builder/json-setting.svelte
@component
@description JSON GuiSchema control backed by the native Textarea primitive.

Features:
- Pretty-prints arrays/objects for editing and parses valid JSON back into the value
- Keeps the last valid value while the text is invalid and shows a localized error
- Applies the Settings tab's hidden label treatment through `labelClass`
-->

<script lang="ts">
	import Textarea from '@components/ui/textarea.svelte';
	import { widget_setting_json_invalid } from '@src/paraglide/messages';

	interface Props {
		value?: unknown;
		label?: string;
		labelClass?: string;
	}

	let { value = $bindable(), label, labelClass }: Props = $props();

	function format(input: unknown): string {
		if (input === undefined || input === null || input === '') return '';
		if (typeof input === 'string') {
			try {
				return JSON.stringify(JSON.parse(input), null, 2);
			} catch {
				return input;
			}
		}
		try {
			return JSON.stringify(input, null, 2);
		} catch {
			return String(input);
		}
	}

	// svelte-ignore state_referenced_locally
	let text = $state(format(value));
	let error = $state('');

	function commit() {
		const raw = text.trim();
		if (!raw) {
			error = '';
			value = null;
			return;
		}
		try {
			value = JSON.parse(raw);
			error = '';
		} catch {
			error = widget_setting_json_invalid();
		}
	}
</script>

<Textarea
	bind:value={text}
	oninput={commit}
	{label}
	{labelClass}
	{error}
	rows={8}
	textareaClass="font-mono text-xs"
/>
