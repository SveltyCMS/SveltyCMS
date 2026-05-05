<script lang="ts">
import { collections } from "@src/stores/collection-store.svelte";
import type { AIEnrichmentProps } from "./types";
import Icon from "@iconify/svelte";
import { logger } from "@utils/logger";
import { getFieldName } from "@utils/utils";

let {
	field,
	value = $bindable(),
	contentLanguage,
} = $props<{
	field: AIEnrichmentProps;
	value: any;
	contentLanguage: string;
}>();

let loading = $state(false);
let error = $state<string | null>(null);
const fieldName = $derived(getFieldName(field));
const inputId = $derived(`ai-enrich-${fieldName}`);
const errorId = $derived(`ai-enrich-error-${fieldName}`);

async function runEnrichment() {
	if (!field.sourceField) {
		error = "No source field configured";
		return;
	}

	const sourceData = collections.activeValue[field.sourceField];
	let sourceText = "";

	if (typeof sourceData === "string") {
		sourceText = sourceData;
	} else if (typeof sourceData === "object" && sourceData !== null) {
		sourceText =
			(sourceData as any)[contentLanguage] ||
			(sourceData as any).content ||
			JSON.stringify(sourceData);
	}

	if (!sourceText) {
		error = `Source field '${field.sourceField}' is empty`;
		return;
	}

	loading = true;
	error = null;

	try {
		const response = await fetch("/api/ai/enrich", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				text: sourceText,
				action: field.action,
				customPrompt: field.customPrompt,
				language: contentLanguage,
			}),
		});

		if (!response.ok) {
			throw new Error(await response.text());
		}

		const data = await response.json();

		if (field.translated) {
			value = { ...value, [contentLanguage]: data.result };
		} else {
			value = data.result;
		}

		logger.info(
			`[AIEnrichment] Successfully enriched from ${field.sourceField}`,
		);
	} catch (err: any) {
		error = err.message || "AI Enrichment failed";
		logger.error("[AIEnrichment] Error:", err);
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

		<button
			type="button"
			class="btn btn-sm variant-soft-tertiary flex items-center gap-2"
			onclick={runEnrichment}
			disabled={loading}
			aria-controls={inputId}
		>
			{#if loading}
				<Icon icon="mdi:loading" class="animate-spin" />
				<span aria-live="polite">Processing...</span>
			{:else}
				<Icon icon="mdi:auto-fix" />
				Enrich from {field.sourceField || 'source'}
			{/if}
		</button>
	</div>
	
	{#if error}
		<span id={errorId} class="text-xs text-error-500" role="alert">{error}</span>
	{/if}

	<div class="relative">
		{#if field.translated}
			<textarea
				id={inputId}
				bind:value={value[contentLanguage]}
				class="textarea w-full p-2"
				placeholder="AI will generate content here..."
				rows={field.action === 'summarize' || field.action === 'seo' ? 4 : 2}
				aria-invalid={!!error}
				aria-describedby={error ? errorId : undefined}
				required={field.required}
			></textarea>
		{:else}
			<textarea
				id={inputId}
				bind:value={value}
				class="textarea w-full p-2"
				placeholder="AI will generate content here..."
				rows={field.action === 'summarize' || field.action === 'seo' ? 4 : 2}
				aria-invalid={!!error}
				aria-describedby={error ? errorId : undefined}
				required={field.required}
			></textarea>
		{/if}
		
		<div class="absolute bottom-2 right-2 flex items-center gap-1 text-[10px] text-surface-400 select-none pointer-events-none">
			<Icon icon="mdi:robot" />
			{field.action.toUpperCase()}
		</div>
	</div>

	{#if field.helper}
		<p class="text-xs text-surface-400">{field.helper}</p>
	{/if}
</div>
