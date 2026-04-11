<!-- 
 @file src/components/system/builder/logic-builder.svelte
 @description Visual Conditional Logic Builder (Recursive)
-->

<script lang="ts">
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
	<div class="logic-group rounded-xl border border-surface-300 bg-surface-50 p-5 dark:border-surface-700 dark:bg-surface-900/70">
		<!-- Header -->
		<div class="mb-5 flex items-center justify-between">
			<div class="flex items-center gap-3">
				<button
					class="btn btn-sm font-mono font-bold tracking-wider px-4
						{value.type === 'AND' 
							? 'preset-filled-primary-500' 
							: 'preset-filled-secondary-500'}"
					onclick={() => toggleGroupType(value!)}
				>
					{value.type}
				</button>
				<span class="text-xs uppercase tracking-[1px] font-medium opacity-60">
					Condition Group
				</span>
			</div>

			<div class="flex gap-2">
				<button
					class="btn btn-sm preset-tonal-surface flex items-center gap-1.5"
					onclick={() => addRule(value!)}
				>
					<iconify-icon icon="mdi:plus" width="16"></iconify-icon>
					<span class="hidden sm:inline">Rule</span>
				</button>

				<button
					class="btn btn-sm preset-tonal-surface flex items-center gap-1.5"
					onclick={() => addGroup(value!)}
				>
					<iconify-icon icon="mdi:group" width="16"></iconify-icon>
					<span class="hidden sm:inline">Sub-group</span>
				</button>
			</div>
		</div>

		<!-- Rules / Groups -->
		<div class="space-y-4">
			{#each value.rules as item, i (item.id)}
				<div transition:slide={{ duration: 180 }}>
					{#if isGroup(item)}
						<!-- Recursive Sub-Group -->
						<div class="ml-8 border-l-2 border-primary-400/30 pl-5 pt-1">
							<LogicBuilder bind:value={value.rules[i] as LogicGroup} {fields} />
						</div>
					{:else}
						<!-- Single Rule -->
						<div class="rule-row flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 shadow-sm dark:bg-surface-800">
							<select
								bind:value={item.field}
								class="select select-sm flex-1 min-w-[140px]"
							>
								{#each uniqueFields as f}
									<option value={f.db_fieldName || f.name}>
										{f.label || f.db_fieldName || f.name}
									</option>
								{/each}
							</select>

							<select
								bind:value={item.operator}
								class="select select-sm w-40"
							>
								{#each operators as op}
									<option value={op.value}>{op.label}</option>
								{/each}
							</select>

							<input
								type="text"
								bind:value={item.value}
								class="input input-sm flex-1 min-w-[120px]"
								placeholder="Value (for 'in' use comma-separated)"
							/>

							<button
								class="btn-icon btn-icon-sm text-error-600 hover:bg-error-500/10 dark:text-error-400"
								onclick={() => removeItem(value!, i)}
								aria-label="Remove condition"
							>
								<iconify-icon icon="mdi:trash-can-outline" width="19"></iconify-icon>
							</button>
						</div>
					{/if}
				</div>
			{/each}

			{#if value.rules.length === 0}
				<div
					class="py-10 text-center text-sm opacity-50 italic border-2 border-dashed border-surface-300 dark:border-surface-700 rounded-xl"
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
