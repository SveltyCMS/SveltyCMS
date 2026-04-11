<!--
@file src/routes/(app)/config/collectionbuilder/nested-content/modal-preset.svelte
@component
**This component displays a modal for selecting a preset**
-->
<script lang="ts">
import PresetSelector from "@src/routes/setup/preset-selector.svelte";
import { PRESETS } from "@src/routes/setup/presets";

interface Props {
	close?: (result?: any) => void;
}

const { close }: Props = $props();

let selectedPreset = $state("blank");
let isSubmitting = $state(false);

async function onSubmit(event: Event) {
	event.preventDefault();
	if (!selectedPreset || selectedPreset === "blank") {
		close?.(null);
		return;
	}

	isSubmitting = true;
	close?.({ presetId: selectedPreset });
}

// Base Classes for Skeleton modal
const cForm = "border border-surface-500 p-4 space-y-4 rounded-xl";
</script>

<div class="modal-example-form space-y-4">
	<form class="modal-form {cForm}" onsubmit={onSubmit}>
		<PresetSelector presets={PRESETS} bind:selected={selectedPreset} />

		<footer class="modal-footer flex justify-end pt-4 border-t border-surface-500/20 gap-2">
			<button type="button" class="preset-outlined-secondary-500 btn" onclick={() => close?.(null)} disabled={isSubmitting}> Cancel </button>
			<button
				type="submit"
				class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500"
				disabled={isSubmitting || selectedPreset === 'blank'}
			>
				Load Preset
			</button>
		</footer>
	</form>
</div>
