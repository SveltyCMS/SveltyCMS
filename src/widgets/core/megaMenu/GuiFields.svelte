<!--
@file src/widgets/core/megaMenu/GuiFields.svelte
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

<div class="megamenu-gui-fields">
	<div class="header-section">
		<h3 class="section-title">Menu Structure Configuration</h3>
		<p class="section-description">
			Define the fields available at each level of your hierarchical menu. Each level can have different widgets and configurations.
		</p>
	</div>

	<div class="levels-container">
		{#each value as levelFields, levelIndex}
			<div class="level-card" class:first-level={levelIndex === 0}>
				<div class="level-header">
					<div class="level-info">
						<h4 class="level-title">Level {levelIndex + 1}</h4>
						{#if levelIndex === 0}
							<span class="level-badge primary">Root Level</span>
						{:else}
							<span class="level-badge secondary">Nested Level</span>
						{/if}
					</div>

					{#if value.length > 1}
						<button
							type="button"
							class="remove-level-btn"
							onclick={() => removeLevel(levelIndex)}
							aria-label="Remove level {levelIndex + 1}"
							title="Remove this menu level"
						>
							<iconify-icon icon="mdi:close" width="16" />
						</button>
					{/if}
				</div>

				<div class="level-content">
					<div class="fields-section">
						<label class="fields-label">
							Fields for Level {levelIndex + 1}
							<span class="field-count">({levelFields.length} field{levelFields.length !== 1 ? 's' : ''})</span>
						</label>

						<WidgetBuilder fields={levelFields} onFieldsChange={(newFields) => updateLevelFields(levelIndex, newFields)} />
					</div>

					{#if levelFields.length === 0}
						<div class="empty-fields-notice">
							<iconify-icon icon="mdi:information-outline" width="20" />
							<span>No fields configured for this level yet.</span>
							<span>Use the Widget Builder above to add fields.</span>
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>

	<div class="actions-section">
		<button type="button" class="add-level-btn" onclick={addLevel}>
			<iconify-icon icon="mdi:plus" width="20" />
			Add Menu Level
		</button>
	</div>
</div>

<style lang="postcss">
	.megamenu-gui-fields {
		@apply space-y-6;
	}

	.header-section {
		@apply border-b border-surface-200 pb-4;
	}

	.section-title {
		@apply mb-2 text-lg font-semibold text-surface-900;
	}

	.section-description {
		@apply text-sm leading-relaxed text-surface-600;
	}

	.levels-container {
		@apply space-y-4;
	}

	.level-card {
		@apply rounded-lg border border-surface-200 bg-surface-50/50;
	}

	.level-card.first-level {
		@apply border-primary-200 bg-primary-50/30;
	}

	.level-header {
		@apply flex items-center justify-between border-b border-surface-200 bg-surface-100/50 p-4;
	}

	.level-info {
		@apply flex items-center gap-3;
	}

	.level-title {
		@apply text-base font-medium text-surface-800;
	}

	.level-badge {
		@apply rounded-full px-2 py-1 text-xs font-medium;
	}

	.level-badge.primary {
		@apply bg-primary-100 text-primary-700;
	}

	.level-badge.secondary {
		@apply bg-secondary-100 text-secondary-700;
	}

	.remove-level-btn {
		@apply rounded-md p-2 text-surface-400 transition-colors hover:bg-error-50 hover:text-error-500;
	}

	.level-content {
		@apply space-y-4 p-4;
	}

	.fields-section {
		@apply space-y-3;
	}

	.fields-label {
		@apply block text-sm font-medium text-surface-700;
	}

	.field-count {
		@apply font-normal text-surface-500;
	}

	.empty-fields-notice {
		@apply flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-surface-300 bg-surface-100/50 p-6 text-center;
	}

	.empty-fields-notice iconify-icon {
		@apply text-surface-400;
	}

	.empty-fields-notice span:first-of-type {
		@apply text-sm font-medium text-surface-600;
	}

	.empty-fields-notice span:last-of-type {
		@apply text-xs text-surface-500;
	}

	.actions-section {
		@apply border-t border-surface-200 pt-4;
	}

	.add-level-btn {
		@apply flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 font-medium text-white transition-colors hover:bg-primary-700;
	}

	/* Dark mode adjustments */
	@media (prefers-color-scheme: dark) {
		.level-card {
			@apply border-surface-700 bg-surface-800/50;
		}

		.level-card.first-level {
			@apply border-primary-700 bg-primary-900/20;
		}

		.level-header {
			@apply border-surface-700 bg-surface-800;
		}

		.level-title {
			@apply text-surface-100;
		}

		.level-badge.primary {
			@apply bg-primary-900 text-primary-200;
		}

		.level-badge.secondary {
			@apply bg-secondary-900 text-secondary-200;
		}

		.remove-level-btn {
			@apply text-surface-500 hover:bg-error-900/20 hover:text-error-400;
		}

		.fields-label {
			@apply text-surface-200;
		}

		.field-count {
			@apply text-surface-400;
		}

		.empty-fields-notice {
			@apply border-surface-600 bg-surface-800/50;
		}

		.empty-fields-notice span:first-of-type {
			@apply text-surface-300;
		}

		.empty-fields-notice span:last-of-type {
			@apply text-surface-400;
		}

		.actions-section {
			@apply border-surface-700;
		}
	}
</style>
