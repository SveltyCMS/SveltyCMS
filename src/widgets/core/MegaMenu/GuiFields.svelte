<!--
@file src/widgets/core/MegaMenu/GuiFields.svelte
@component - GUI fields component for mega menu configuration

Provides an intuitive interface for configuring hierarchical menu structures.
Allows users to define different widget fields for each menu level.

@example
<GuiFields bind:value={menuLevels} />
Interactive level configuration with add/remove level capabilities

### Props
- `value: FieldInstance[][]` - Array of field arrays for each menu level (bindable)

### Features
- **Level Management**: Add/remove menu levels dynamically
- **Widget Builder Integration**: Uses WidgetBuilder for field configuration
- **Visual Hierarchy**: Clear level indicators and organization
- **Real-time Updates**: Immediate reactivity for level changes
- **Validation Ready**: Structured for proper validation integration
- **Accessibility**: Proper ARIA labels and keyboard navigation
-->

<script lang="ts">
	import WidgetBuilder from '@components/system/builder/WidgetBuilder.svelte';
	import type { FieldInstance } from '@src/content/types';

	let { value = $bindable([]) }: { value: FieldInstance[][] } = $props();

	// Initialize with at least one level if empty
	if (!value || value.length === 0) {
		value = [[]];
	}

	// Add a new menu level
	function addLevel() {
		value = [...value, []];
	}

	// Remove a specific level
	function removeLevel(index: number) {
		if (value.length > 1) {
			value = value.filter((_, i) => i !== index);
		}
	}

	// Update fields for a specific level
	function updateLevelFields(index: number, newFields: FieldInstance[]) {
		value[index] = newFields;
		value = [...value]; // Trigger reactivity
	}
</script>

<div class="space-y-6">
	<div class="border-b border-surface-200 pb-4 dark:border-surface-700">
		<h3 class="mb-2 text-lg font-semibold text-surface-900 dark:text-surface-100">Menu Structure Configuration</h3>
		<p class="text-sm leading-relaxed text-surface-600 dark:text-surface-300">
			Define the fields available at each level of your hierarchical menu. Each level can have different widgets and configurations.
		</p>
	</div>

	<div class="levels-container space-y-4">
		{#each value as levelFields, levelIndex}
			<div
				class="level-card rounded-lg border border-surface-200 bg-surface-50/50 dark:border-surface-700 dark:bg-surface-800/50 {levelIndex === 0
					? '!border-primary-200 !bg-primary-50/30 dark:!border-primary-700 dark:!bg-primary-900/20'
					: ''}"
			>
				<div
					class="level-header flex items-center justify-between border-b border-surface-200 bg-surface-100/50 p-4 dark:border-surface-700 dark:bg-surface-800"
				>
					<div class="level-info flex items-center gap-3">
						<h4 class="level-title text-base font-medium text-surface-800 dark:text-surface-100">Level {levelIndex + 1}</h4>
						{#if levelIndex === 0}
							<span
								class="level-badge rounded-full bg-primary-100 px-2 py-1 text-xs font-medium text-primary-700 dark:bg-primary-900 dark:text-primary-200"
								>Root Level</span
							>
						{:else}
							<span
								class="level-badge rounded-full bg-secondary-100 px-2 py-1 text-xs font-medium text-secondary-700 dark:bg-secondary-900 dark:text-secondary-200"
								>Nested Level</span
							>
						{/if}
					</div>

					{#if value.length > 1}
						<button
							type="button"
							class="preset-filled-error-500 btn"
							onclick={() => removeLevel(levelIndex)}
							aria-label="Remove level {levelIndex + 1}"
							title="Remove this menu level"
						>
							<iconify-icon icon="mdi:close" width="16"></iconify-icon>
						</button>
					{/if}
				</div>

				<div class="space-y-4 p-4">
					<div class="space-y-3">
						<label class="block text-sm font-medium text-surface-700 dark:text-surface-200" for={'widget-builder-' + levelIndex}>
							Fields for Level {levelIndex + 1}
							<span class="field-count font-normal text-surface-500 dark:text-surface-400"
								>({levelFields.length} field{levelFields.length !== 1 ? 's' : ''})</span
							>
						</label>

						<WidgetBuilder fields={levelFields} onFieldsChange={(newFields) => updateLevelFields(levelIndex, newFields)} />
					</div>

					{#if levelFields.length === 0}
						<div
							class="empty-fields-notice flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-surface-300 bg-surface-100/50 p-6 text-center dark:border-surface-600 dark:bg-surface-800/50"
						>
							<iconify-icon icon="mdi:information-outline" width="20" class="text-surface-400"></iconify-icon>
							<span class="text-sm font-medium text-surface-600 dark:text-surface-300">No fields configured for this level yet.</span>
							<span class="text-xs text-surface-500 dark:text-surface-400">Use the Widget Builder above to add fields.</span>
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	<div class=" border-t border-surface-200 pt-4 dark:border-surface-700">
		<button type="button" class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500" onclick={addLevel}>
			<iconify-icon icon="mdi:plus" width="20"></iconify-icon>
			Add Menu Level
		</button>
	</div>
</div>
