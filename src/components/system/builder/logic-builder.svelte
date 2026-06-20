<!--
 @file src/components/system/builder/logic-builder.svelte
 @description Visual Conditional Logic Builder (Recursive)
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
	import { slide } from 'svelte/transition';
	import { generateUUID } from '@utils/native-utils';
	import LogicBuilder from './logic-builder.svelte';
	import type { Rule, LogicGroup } from './logic-types';

	// Props
	let {
		value = $bindable<LogicGroup>(),
		fields = []
	}: {
		value?: LogicGroup;
		fields: any[];
	} = $props();

	// Deduplicated fields for better UX
	const uniqueFields = $derived.by(() => {
		const seen = new Set<string>();
		return fields.filter((f: any) => {
			const key = f.db_fieldName || f.name;
			if (!key || seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	});

	// Initialize default value if empty
	$effect(() => {
		if (!value || typeof value !== 'object') {
			value = {
				id: generateUUID(),
				type: 'AND',
				rules: []
			};
		} else if (!value.id) {
			value.id = generateUUID();
		}
	});

	const operators = [
		{ label: 'Equals', value: 'eq' },
		{ label: 'Not Equals', value: 'neq' },
		{ label: 'Greater Than', value: 'gt' },
		{ label: 'Less Than', value: 'lt' },
		{ label: 'Contains', value: 'contains' },
		{ label: 'Is In (comma separated)', value: 'in' }
	] as const;

	// Actions
	function addRule(group: LogicGroup) {
		group.rules.push({
			id: generateUUID(),
			field: uniqueFields[0]?.db_fieldName || uniqueFields[0]?.name || '',
			operator: 'eq',
			value: ''
		});
	}

	function addGroup(group: LogicGroup) {
		group.rules.push({
			id: generateUUID(),
			type: 'AND',
			rules: []
		});
	}

	function removeItem(group: LogicGroup, index: number) {
		group.rules.splice(index, 1);
	}

	function toggleGroupType(group: LogicGroup) {
		group.type = group.type === 'AND' ? 'OR' : 'AND';
	}

	// Helper to check if item is a group
	function isGroup(item: Rule | LogicGroup): item is LogicGroup {
		return 'type' in item && Array.isArray((item as any).rules);
	}
</script>

{#if value}
	<div class="logic-group rounded border border-surface-300 bg-surface-50 p-5 dark:border-surface-700 dark:bg-surface-900/70">
		<!-- Header -->
		<div class="mb-5 flex items-center justify-between">
			<div class="flex items-center gap-3">
				<Button variant="tertiary"
					onclick={() => toggleGroupType(value!)}
					aria-label="toggle-condition-type"
				 size="sm" class="font-mono tracking-wider px-4 {value.type === 'AND' ? ' dark: ' : ' '}">
					{value.type}
				</Button>
				<span class="text-xs uppercase tracking-[1px] font-medium opacity-60">
					Condition Group
				</span>
			</div>

			<div class="flex gap-2">
				<Button variant="surface"
					onclick={() => addRule(value!)}
					aria-label="add-rule"
				 size="sm" class="flex items-center gap-1.5">
					<iconify-icon icon="mdi:plus" width="16"></iconify-icon>
					<span class="hidden sm:inline">Rule</span>
				</Button>

				<Button variant="surface"
					onclick={() => addGroup(value!)}
					aria-label="add-sub-group"
				 size="sm" class="flex items-center gap-1.5">
					<iconify-icon icon="mdi:group" width="16"></iconify-icon>
					<span class="hidden sm:inline">Sub-group</span>
				</Button>
			</div>
		</div>

		<!-- Rules / Groups -->
		<div class="space-y-4">
			{#each value.rules as item, i (item.id)}
				<div transition:slide={{ duration: 180 }}>
					{#if isGroup(item)}
						<!-- Recursive Sub-Group -->
						<div class="ms-8 border-s-2 border-primary-400/30 ps-5 pt-1">
							<LogicBuilder bind:value={value.rules[i] as LogicGroup} {fields} />
						</div>
					{:else}
						<!-- Single Rule -->
						<div class="rule-row flex flex-wrap items-center gap-3 rounded bg-white p-3 shadow-sm dark:bg-surface-800">
							<Select
								bind:value={item.field}
								size="sm"
								class="flex-1 min-w-35"
								placeholder="Select field..."
								options={uniqueFields.map((f) => ({
									value: f.db_fieldName || f.name,
									label: f.label || f.db_fieldName || f.name
								}))}
								label="Select field"
							/>

							<Select
								bind:value={item.operator}
								size="sm"
								class="w-40"
								placeholder="Select operator..."
								options={operators.map((op) => ({ value: op.value, label: op.label }))}
								label="Select operator"
							/>

							<Input
								type="text"
								bind:value={item.value}
								inputClass="h-8 text-xs"
								class="flex-1 min-w-30"
								placeholder="Value (for 'in' use comma-separated)"
								aria-label="condition-value"
							/>

							<Button variant="ghost"
								onclick={() => removeItem(value!, i)}
								aria-label="remove-condition"
							 class="p-0! min-w-0 text-error-600 hover:bg-error-500/10 dark:text-error-500">
								<iconify-icon icon="mdi:trash-can-outline" width="19"></iconify-icon>
							</Button>
						</div>
					{/if}
				</div>
			{/each}

			{#if value.rules.length === 0}
				<div
					class="py-10 text-center text-sm opacity-50 italic border-2 border-dashed border-surface-300 dark:border-surface-700 rounded"
				>
					No conditions yet.<br />
					Add a rule or sub-group to start building logic.
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.logic-group {
		transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.rule-row {
		transition: all 0.2s ease;
	}

	.rule-row:hover {
		box-shadow: 0 4px 12px -2px rgb(0 0 0 / 0.1);
	}
</style>
