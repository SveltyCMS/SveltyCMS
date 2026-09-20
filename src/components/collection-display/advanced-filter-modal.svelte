<!--
@file src/components/collection-display/advanced-filter-modal.svelte
@description
Modal for constructing multi-clause AND/OR filter expressions across collection schema fields.
Provides operator selection, type-specific inputs, and accessible keyboard navigation.

@component
**AdvancedFilterModal component for advanced compound queries.**

### Features:
- Multi-clause row builder (field, operator, value)
- Conjunction selection (Match ALL / AND vs Match ANY / OR)
- Dynamic operator resolution based on field widget type
- Fully accessible keyboard traversal and ARIA dialog
- Type-safe clause validation

### Props:
- `isOpen` (boolean, bindable): Controls modal visibility
- `fields` (FieldInstance[]): Collection schema fields
- `initialClauses` (AdvancedFilterClause[]): Existing clauses to populate
- `initialConjunction` ('AND' | 'OR'): Active conjunction
- `onApply` (function): Callback receiving validated clauses and conjunction
- `onClose` (function): Callback on modal dismissal
-->

<script module lang="ts">
	export type FilterOperator =
		| 'equals'
		| 'not_equals'
		| 'contains'
		| 'not_contains'
		| 'starts_with'
		| 'ends_with'
		| 'gt'
		| 'gte'
		| 'lt'
		| 'lte'
		| 'is_empty'
		| 'is_not_empty';

	export interface AdvancedFilterClause {
		id: string;
		field: string;
		operator: FilterOperator;
		value: string;
	}

	export interface OperatorOption {
		value: FilterOperator;
		label: string;
	}

	export const STRING_OPERATORS: OperatorOption[] = [
		{ value: 'contains', label: 'contains' },
		{ value: 'not_contains', label: 'does not contain' },
		{ value: 'equals', label: 'equals' },
		{ value: 'not_equals', label: 'does not equal' },
		{ value: 'starts_with', label: 'starts with' },
		{ value: 'ends_with', label: 'ends with' },
		{ value: 'is_empty', label: 'is empty' },
		{ value: 'is_not_empty', label: 'is not empty' }
	];

	export const NUMBER_OPERATORS: OperatorOption[] = [
		{ value: 'equals', label: '=' },
		{ value: 'not_equals', label: '≠' },
		{ value: 'gt', label: '>' },
		{ value: 'gte', label: '≥' },
		{ value: 'lt', label: '<' },
		{ value: 'lte', label: '≤' },
		{ value: 'is_empty', label: 'is empty' },
		{ value: 'is_not_empty', label: 'is not empty' }
	];

	export const BOOLEAN_OPERATORS: OperatorOption[] = [
		{ value: 'equals', label: 'is' },
		{ value: 'not_equals', label: 'is not' }
	];
</script>

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import type { FieldDefinition, FieldInstance } from '@src/content/types';
	import { getFieldName } from '@utils/schema/field-utils';

	interface Props {
		isOpen?: boolean;
		/**
		 * Schema fields to offer as filter columns: compiled `FieldInstance` entries or
		 * raw `FieldDefinition` entries (collection schemas may hold placeholders/join
		 * fields). Only the display keys below are read.
		 */
		fields?: readonly (FieldInstance | FieldDefinition)[];
		initialClauses?: AdvancedFilterClause[];
		initialConjunction?: 'AND' | 'OR';
		onApply: (clauses: AdvancedFilterClause[], conjunction: 'AND' | 'OR') => void;
		onClose: () => void;
	}

	let {
		isOpen = $bindable(false),
		fields = [],
		initialClauses = [],
		initialConjunction = 'AND',
		onApply,
		onClose
	}: Props = $props();

	const SYSTEM_FIELDS = [
		{ name: 'status', label: 'Status', widgetName: 'select' },
		{ name: 'createdAt', label: 'Created At', widgetName: 'date' },
		{ name: 'updatedAt', label: 'Updated At', widgetName: 'date' }
	];

	const availableFields = $derived.by(() => {
		const schemaFields = (fields || []).map((f) => {
			const typed = f as { db_fieldName?: string; label?: string; widget?: { Name?: string }; type?: string };
			const name = typed.db_fieldName || getFieldName(f as FieldInstance, false);
			const label = typed.label || name;
			const widgetName = (typed.widget?.Name || typed.type || 'input').toLowerCase();
			return { name, label, widgetName };
		}).filter((f) => f.name);

		return [...SYSTEM_FIELDS, ...schemaFields];
	});

	const fieldSelectOptions = $derived(
		availableFields.map((f) => ({
			value: f.name,
			label: `${f.label} (${f.name})`
		}))
	);

	let conjunction = $state<'AND' | 'OR'>(initialConjunction);
	let clauses = $state<AdvancedFilterClause[]>([]);

	function createEmptyClause(): AdvancedFilterClause {
		const defaultField = availableFields[0]?.name || 'status';
		return {
			id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `clause-${Date.now()}-${Math.floor(performance.now() * 1000)}`,
			field: defaultField,
			operator: 'equals',
			value: ''
		};
	}

	$effect(() => {
		if (isOpen) {
			conjunction = initialConjunction;
			if (initialClauses && initialClauses.length > 0) {
				clauses = initialClauses.map((c) => ({ ...c }));
			} else {
				clauses = [createEmptyClause()];
			}
		}
	});

	function addClause() {
		clauses = [...clauses, createEmptyClause()];
	}

	function removeClause(index: number) {
		if (clauses.length <= 1) {
			clauses = [createEmptyClause()];
		} else {
			clauses = clauses.filter((_, idx) => idx !== index);
		}
	}

	function clearAll() {
		clauses = [createEmptyClause()];
	}

	function getOperatorsForField(fieldName: string): OperatorOption[] {
		const field = availableFields.find((f) => f.name === fieldName);
		if (!field) return STRING_OPERATORS;
		const w = field.widgetName;
		if (w === 'checkbox' || w === 'boolean') return BOOLEAN_OPERATORS;
		if (w === 'number' || w === 'currency' || w === 'price' || w === 'date' || w === 'datetime') {
			return NUMBER_OPERATORS;
		}
		return STRING_OPERATORS;
	}

	function isNoValueOperator(op: FilterOperator): boolean {
		return op === 'is_empty' || op === 'is_not_empty';
	}

	function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		const validClauses = clauses.filter((c) => c.field && (isNoValueOperator(c.operator) || c.value.trim().length > 0));
		onApply(validClauses, conjunction);
		isOpen = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			isOpen = false;
			onClose();
		}
	}
</script>

{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
		role="presentation"
		onclick={(e) => {
			if (e.target === e.currentTarget) {
				isOpen = false;
				onClose();
			}
		}}
		onkeydown={handleKeydown}
	>
		<AdminCard
			class="w-full max-w-2xl space-y-4 border border-surface-500/30 bg-white p-6 shadow-2xl dark:border-surface-500/40 dark:bg-surface-800 max-h-[90vh] flex flex-col"
			role="dialog"
			aria-modal="true"
			aria-labelledby="adv-filter-title"
		>
			<header class="flex items-center justify-between border-b border-surface-500/20 pb-3">
				<div>
					<h3 id="adv-filter-title" class="text-lg font-bold text-tertiary-500 dark:text-primary-500">
						Advanced Filters
					</h3>
					<p class="text-xs text-surface-500 dark:text-surface-400">
						Build compound multi-clause filter queries with AND / OR conjunctions.
					</p>
				</div>
				<button
					type="button"
					class="p-1 rounded-lg text-surface-500 hover:text-surface-600 dark:hover:text-surface-100 hover:bg-surface-500/10"
					onclick={() => {
						isOpen = false;
						onClose();
					}}
					aria-label="Close dialog"
				>
					<iconify-icon icon="material-symbols:close" width="20"></iconify-icon>
				</button>
			</header>

			<!-- Conjunction switch -->
			<div class="flex items-center gap-3 py-1">
				<span class="text-xs font-semibold uppercase text-surface-600 dark:text-surface-400">Match:</span>
				<div class="inline-flex rounded-lg border border-surface-500/30 bg-surface-500/10 p-0.5 dark:border-surface-500/40 dark:bg-surface-900">
					<button
						type="button"
						class="px-3 py-1 text-xs font-medium rounded-md transition-colors {conjunction === 'AND'
							? 'bg-primary-500 text-white font-bold shadow-xs'
							: 'text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-white'}"
						onclick={() => (conjunction = 'AND')}
					>
						ALL conditions (AND)
					</button>
					<button
						type="button"
						class="px-3 py-1 text-xs font-medium rounded-md transition-colors {conjunction === 'OR'
							? 'bg-primary-500 text-white font-bold shadow-xs'
							: 'text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-white'}"
						onclick={() => (conjunction = 'OR')}
					>
						ANY condition (OR)
					</button>
				</div>
			</div>

			<!-- Clause list -->
			<form class="flex-1 overflow-y-auto space-y-3 py-2 pe-1" onsubmit={handleSubmit}>
				{#each clauses as clause, index (clause.id)}
					{@const ops = getOperatorsForField(clause.field)}
					{@const noValue = isNoValueOperator(clause.operator)}
					<div class="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2 rounded-lg border border-surface-500/20 bg-surface-500/10 dark:bg-surface-900/20">
						<span class="text-xs font-bold text-surface-400 w-6 text-center shrink-0">
							{index + 1}.
						</span>

						<!-- Field Select -->
						<div class="w-full sm:w-44 shrink-0">
							<Select
								size="sm"
								label=""
								placeholder="Field"
								options={fieldSelectOptions}
								bind:value={clause.field}
								aria-label={`Field for condition ${index + 1}`}
							/>
						</div>

						<!-- Operator Select -->
						<div class="w-full sm:w-36 shrink-0">
							<Select
								size="sm"
								label=""
								placeholder="Operator"
								options={ops}
								bind:value={clause.operator}
								aria-label={`Operator for condition ${index + 1}`}
							/>
						</div>

						<!-- Value Input -->
						<div class="flex-1 min-w-32">
							{#if noValue}
								<span class="text-xs text-surface-400 italic px-2">No value required</span>
							{:else}
								<input
									type="text"
									bind:value={clause.value}
									placeholder="Value..."
									class="h-9 w-full rounded border border-surface-500/30 bg-white px-2.5 text-xs text-surface-800 placeholder:text-surface-400 dark:border-surface-500/40 dark:bg-surface-800 dark:text-surface-100 dark:placeholder:text-surface-500"
									aria-label={`Value for condition ${index + 1}`}
								/>
							{/if}
						</div>

						<!-- Delete clause button -->
						<button
							type="button"
							class="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg text-surface-500 hover:text-error-500 hover:bg-error-500/10 transition-colors"
							onclick={() => removeClause(index)}
							aria-label={`Remove condition ${index + 1}`}
							title="Remove condition"
						>
							<iconify-icon icon="material-symbols:delete-outline-rounded" width="18"></iconify-icon>
						</button>
					</div>
				{/each}

				<!-- Add Clause Row -->
				<div class="pt-1">
					<Button
						variant="outline"
						size="sm"
						type="button"
						onclick={addClause}
						class="gap-1 text-xs"
					>
						<iconify-icon icon="material-symbols:add" width="16"></iconify-icon>
						Add Condition
					</Button>
				</div>

				<footer class="flex items-center justify-between border-t border-surface-500/20 pt-4 mt-4">
					<Button
						variant="ghost"
						size="sm"
						type="button"
						onclick={clearAll}
						class="text-xs text-surface-500 hover:text-error-500"
					>
						Reset Conditions
					</Button>

					<div class="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							type="button"
							onclick={() => {
								isOpen = false;
								onClose();
							}}
						>
							Cancel
						</Button>
						<Button
							variant="primary"
							size="sm"
							type="submit"
						>
							Apply Filters
						</Button>
					</div>
				</footer>
			</form>
		</AdminCard>
	</div>
{/if}
