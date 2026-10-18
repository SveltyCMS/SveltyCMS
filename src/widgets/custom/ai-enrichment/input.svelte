<!--
	@file src/widgets/custom/ai-enrichment/input.svelte
	@description AI Enrichment widget input. Sends the configured source field to
		`/api/ai/enrich` and unwraps the server's `{ success, data }` envelope before
		writing a string value (or a translated-record entry) into the field.

	Features:
	- Defensive envelope parsing (`data` | legacy `result`) with server-message errors
	- Array results (keywords/tags) normalized to a comma-separated string
	- Client-side guard for the `custom` action's required prompt

	@component
-->

<script lang="ts">
	import {
		common_processing,
		widget_ai_enrich_from,
		widget_ai_placeholder
	} from '@src/paraglide/messages';
	import { collections } from '@src/stores/collection-store.svelte';
	import type { AIEnrichmentProps } from './types';
	import { normalizeEnrichmentResult } from './normalize';
	import { logger } from '@utils/logger';
	import { clientJsonHeaders } from '@utils/security/client-csrf';
	import { getFieldName } from '@utils/schema/field-utils';
	import Button from '@components/ui/button.svelte';
	import Textarea from '@components/ui/textarea.svelte';

	let {
		field,
		value = $bindable(),
		contentLanguage
	}: {
		field: AIEnrichmentProps;
		value: any;
		contentLanguage: string;
	} = $props();

	let loading = $state(false);
	let error = $state<string | null>(null);
	const fieldName = $derived(getFieldName(field));
	const inputId = $derived(`ai-enrich-${fieldName}`);
	const errorId = $derived(`ai-enrich-error-${fieldName}`);

	/** Extract the server's error message from a non-OK response, falling back to the status. */
	async function readErrorMessage(response: Response): Promise<string> {
		try {
			const body = (await response.json()) as {
				message?: unknown;
				error?: { message?: unknown };
			};
			if (typeof body?.message === 'string' && body.message.trim()) return body.message;
			if (typeof body?.error?.message === 'string' && body.error.message.trim())
				return body.error.message;
		} catch (parseError) {
			logger.debug('[AIEnrichment] Non-JSON error response body', parseError);
		}
		return `AI Enrichment failed (${response.status})`;
	}

	async function runEnrichment() {
		if (!field.sourceField) {
			error = 'No source field configured';
			return;
		}

		const sourceData = collections.activeValue[field.sourceField];
		let sourceText = '';

		if (typeof sourceData === 'string') {
			sourceText = sourceData;
		} else if (typeof sourceData === 'object' && sourceData !== null) {
			sourceText =
				(sourceData as any)[contentLanguage] ||
				(sourceData as any).content ||
				JSON.stringify(sourceData);
		}

		if (!sourceText.trim()) {
			error = `Source field '${field.sourceField}' is empty`;
			return;
		}

		const customPrompt = typeof field.customPrompt === 'string' ? field.customPrompt.trim() : '';
		if (field.action === 'custom' && !customPrompt) {
			error = 'Custom prompt is required';
			return;
		}

		loading = true;
		error = null;

		try {
			const response = await fetch('/api/ai/enrich', {
				method: 'POST',
				headers: clientJsonHeaders(),
				body: JSON.stringify({
					text: sourceText,
					action: field.action,
					customPrompt: customPrompt || undefined,
					language: contentLanguage
				})
			});

			if (!response.ok) {
				throw new Error(await readErrorMessage(response));
			}

			const data: unknown = await response.json();
			const outcome = normalizeEnrichmentResult(data, {
				translated: Boolean(field.translated),
				language: contentLanguage,
				current: value
			});

			if (!outcome.ok) {
				error = outcome.error;
				return;
			}

			value = outcome.value;

			logger.info(`[AIEnrichment] Successfully enriched from ${field.sourceField}`);
		} catch (err: unknown) {
			error = (err instanceof Error ? err.message : String(err)) || 'AI Enrichment failed';
			logger.error('[AIEnrichment] Error:', err);
		} finally {
			loading = false;
		}
	}
</script>

<div class="flex flex-col gap-2 w-full">
	<div class="flex items-center justify-between gap-2">
		<label for={inputId} class="label text-sm font-bold">
			{field.label}
			{#if field.required}<span class="text-error-500">*</span>{/if}
		</label>

		<Button
			variant="outline"
			type="button"
			class="px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-2 transition-all bg-tertiary-500/10 hover:bg-tertiary-500/20 text-tertiary-600 dark:bg-primary-500/10 dark:hover:bg-primary-500/20 dark:text-primary-500 disabled:opacity-50 disabled:pointer-events-none"
			onclick={runEnrichment}
			disabled={loading}
			aria-controls={inputId}
		>
			{#if loading}
				<iconify-icon icon="mdi:loading" class="animate-spin"></iconify-icon>
				<span aria-live="polite">{common_processing()}</span>
			{:else}
				<iconify-icon icon="mdi:auto-fix"></iconify-icon>
				{widget_ai_enrich_from({ source: field.sourceField || 'source' })}
			{/if}
		</Button>
	</div>

	{#if error}
		<span id={errorId} class="text-xs text-error-500" role="alert">{error}</span>
	{/if}

	<div class="relative">
		{#if field.translated}
			<Textarea
				id={inputId}
				bind:value={value[contentLanguage]}
				class="w-full space-y-0"
				textareaClass="w-full p-2"
				placeholder={widget_ai_placeholder()}
				rows={field.action === 'summarize' || field.action === 'seo' ? 4 : 2}
				aria-invalid={!!error}
				aria-describedby={error ? errorId : undefined}
				required={field.required}
			/>
		{:else}
			<Textarea
				id={inputId}
				bind:value
				class="w-full space-y-0"
				textareaClass="w-full p-2"
				placeholder={widget_ai_placeholder()}
				rows={field.action === 'summarize' || field.action === 'seo' ? 4 : 2}
				aria-invalid={!!error}
				aria-describedby={error ? errorId : undefined}
				required={field.required}
			/>
		{/if}

		<div
			class="absolute bottom-2 inset-e-2 flex items-center gap-1 text-[10px] text-surface-400 select-none pointer-events-none"
		>
			<iconify-icon icon="mdi:robot"></iconify-icon>
			{field.action.toUpperCase()}
		</div>
	</div>

	{#if field.helper}
		<p class="text-xs text-surface-400">{field.helper}</p>
	{/if}
</div>
