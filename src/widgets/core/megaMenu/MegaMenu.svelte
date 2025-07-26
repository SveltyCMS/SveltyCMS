<!-- 
@file src/widgets/core/megaMenu/MegaMenu.svelte
@component
**MegaMenu widget component to create a mega menu with nested structure and drag-and-drop functionality**

@example
<MegaMenu label="MegaMenu" db_fieldName="megaMenu" required={true} />

### Props
- `field`: FieldType
- `value`: any

### Features
- Translatable
- Optimized performance with proper reactivity
- Better error handling and validation
- Improved accessibility
-->

<script lang="ts">
	// Stores
	import { saveFunction, translationProgress, shouldShowNextButton, validationStore } from '@stores/store.svelte';
	import { collectionValue, mode } from '@stores/collectionStore.svelte';
	import { headerController } from '@stores/UIStore.svelte';

	// Components
	import Fields from '@components/collectionDisplay/Fields.svelte';
	import ListNode from './ListNode.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	import { currentChild, type FieldType } from '.';
	import { extractData, getFieldName } from '@utils/utils';
	import type { Field } from '@src/content/types';

	// Validation schema for each menu layer
	import * as v from 'valibot';

	interface Props {
		field: FieldType;
		value?: any;
	}

	let { field, value = collectionValue()[getFieldName(field)] }: Props = $props();

	// --- HEADER CONTROL EFFECT ---
	$effect(() => {
		headerController.setShowMore(true);
		return () => headerController.setShowMore(false);
	});

	const fieldName = getFieldName(field);

	// Hide translation progress initially
	translationProgress.update((current) => ({ ...current, show: false }));

	// Export widget data function
	export const WidgetData = async () => _data;

	// State variables with better organization
	let MENU_CONTAINER: HTMLUListElement | undefined = $state();
	let showFields = $state(false);
	let depth = $state(0);
	let _data: { [key: string]: any; children: any[] } = $state(mode.value === 'create' ? null : value);
	let fieldsData = $state({});
	let validationError: string | null = $state(null);
	let isLoading = $state(false);

	const saveMode = mode.value;

	// Validation schema
	const widgetSchema = v.object({
		name: v.pipe(v.string(), v.minLength(1, 'Menu name is required')),
		children: v.optional(v.array(v.any()))
	});

	// Memoized current fields to prevent unnecessary recalculations
	let currentFields = $derived.by(() => {
		const fieldsAtDepth = field.fields[depth];
		if (!fieldsAtDepth) return [];

		return fieldsAtDepth.map((f) => ({
			...f,
			type: f.widget.Name,
			config: f.widget
		})) as Field[];
	});

	// Validation function
	function validateSchema(schema: typeof widgetSchema, data: any): string | null {
		try {
			v.parse(schema, data);
			validationStore.clearError(fieldName);
			return null; // No error
		} catch (error) {
			if (error instanceof v.ValiError) {
				const errorMessage = error.issues[0]?.message || 'Invalid input';
				validationStore.setError(fieldName, errorMessage);
				return errorMessage;
			}
			return 'Invalid input';
		}
	}

	// Validate input with debouncing for better performance
	let validationTimeout: ReturnType<typeof setTimeout>;
	function validateInput(data: any) {
		clearTimeout(validationTimeout);
		validationTimeout = setTimeout(() => {
			validationError = validateSchema(widgetSchema, data);
		}, 300);
	}

	// Save layer
	async function saveLayer() {
		if (isLoading) return; // Prevent multiple simultaneous saves

		try {
			isLoading = true;
			const _fieldsData = await extractData(fieldsData);

			// Clear previous validation error before new validation
			validationError = null;
			validateInput(_fieldsData);

			// Wait for validation to complete
			await new Promise((resolve) => setTimeout(resolve, 350));

			if (!validationError) {
				if (!_data) {
					_data = { ..._fieldsData, children: [] };
				} else if (mode.value === 'edit') {
					// More efficient object update
					Object.assign($currentChild, _fieldsData);
				} else if (mode.value === 'create' && $currentChild.children) {
					$currentChild.children.push({ ..._fieldsData, children: [] });
				}

				// Reset UI state
				showFields = false;
				mode.set(saveMode);
				depth = 0;
				shouldShowNextButton.set(false);
				$saveFunction.reset();

				// Clear fields data for next use
				fieldsData = {};
			}
		} catch (error) {
			console.error('Error saving layer:', error);
			validationError = 'An error occurred while saving. Please try again.';
		} finally {
			isLoading = false;
		}
	}

	// Effect to update save function reference
	$effect(() => {
		$saveFunction.fn = saveLayer;
	});

	// Cleanup effect for validation timeout
	$effect(() => {
		return () => {
			if (validationTimeout) {
				clearTimeout(validationTimeout);
			}
		};
	});
</script>

<div class="menu-container relative mb-4" role="region" aria-label="Mega Menu Configuration">
	<!-- Initial state message -->
	{#if !_data}
		<div class="text-center font-bold text-tertiary-500" role="status">
			{m.widget_megamenu_title()}
		</div>
	{/if}

	<!-- First Menu Entry -->
	{#if !_data || showFields}
		<div class="transition-all duration-200" class:error={!!validationError} class:loading={isLoading}>
			{#key depth}
				{(fieldsData = {}) && ''}
				<Fields
					fields={currentFields}
					root={false}
					bind:fieldsData
					customData={$currentChild}
					ariaInvalid={!!validationError}
					ariaDescribedby={validationError ? `${fieldName}-error` : undefined}
				/>
			{/key}
		</div>
	{/if}

	<!-- Show children -->
	{#if _data}
		<ul
			bind:this={MENU_CONTAINER}
			class="children MENU_CONTAINER transition-opacity duration-200"
			class:hidden={depth !== 0}
			class:error={!!validationError}
			class:opacity-50={isLoading}
			role="tree"
			aria-label="Menu Structure"
		>
			<div class="w-screen" aria-hidden="true"></div>
			<ListNode {MENU_CONTAINER} self={_data} bind:depth bind:showFields maxDepth={field.fields.length} expanded={true} />
		</ul>
	{/if}

	<!-- Loading indicator -->
	{#if isLoading}
		<div class="absolute inset-0 flex items-center justify-center bg-surface-50/50 backdrop-blur-sm">
			<div class="loading-spinner" aria-label="Saving..."></div>
		</div>
	{/if}

	<!-- Error message -->
	{#if validationError}
		<div id="{fieldName}-error" class="error-message" role="alert" aria-live="polite">
			<iconify-icon icon="mdi:alert-circle" width="16" class="text-error-500"></iconify-icon>
			{validationError}
		</div>
	{/if}
</div>

<style lang="postcss">
	.menu-container {
		min-height: 2.5rem;
		position: relative;
	}

	.error {
		@apply border-error-500 ring-2 ring-error-500/20;
		animation: shake 0.3s ease-in-out;
	}

	.loading {
		@apply pointer-events-none opacity-75;
	}

	.error-message {
		@apply absolute -bottom-8 left-0 flex w-full items-center justify-center gap-2 rounded border border-error-200 bg-error-50 px-2 py-1 text-xs text-error-500 transition-all duration-200;
	}

	.loading-spinner {
		@apply h-6 w-6 rounded-full border-2 border-tertiary-200 border-t-tertiary-600;
		animation: spin 1s linear infinite;
	}

	@keyframes shake {
		0%,
		100% {
			transform: translateX(0);
		}
		25% {
			transform: translateX(-2px);
		}
		75% {
			transform: translateX(2px);
		}
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.children {
		@apply transition-all duration-300 ease-in-out;
	}

	.MENU_CONTAINER {
		@apply relative overflow-visible;
	}

	/* Improve focus styles for better accessibility */
	.menu-container:focus-within {
		@apply ring-2 ring-primary-500/30;
	}

	/* Better responsive behavior */
	@media (max-width: 768px) {
		.menu-container {
			@apply text-sm;
		}

		.error-message {
			@apply px-1 py-0.5 text-xs;
		}
	}
</style>
