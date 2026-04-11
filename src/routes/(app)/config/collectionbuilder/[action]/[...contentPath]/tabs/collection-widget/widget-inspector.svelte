<!-- 
@file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-widget/widget-inspector.svelte
@component
**Persistent Inspector panel for widget configuration**
-->
<script lang="ts">
import {
	setTargetWidget,
	targetWidget,
} from "@src/stores/collection-store.svelte";
import Button from "@src/components/ui/button.svelte";
import SegmentedControl from "@src/components/ui/segmented-control.svelte";
import Input from "@src/components/ui/input.svelte";
import { toast } from "@src/stores/toast.svelte.ts";
import type { Role } from "@src/databases/auth/types";

let { roles = [], onSave } = $props<{
	roles: Role[];
	onSave: (updated: any) => void;
}>();

let activeTab = $state("general");
const tabs = [
	{ value: "general", label: "General", icon: "mdi:cog" },
	{ value: "special", label: "Special", icon: "mdi:star-outline" },
	{
		value: "permissions",
		label: "Permissions",
		icon: "mdi:shield-lock-outline",
	},
];

// Local state for editing to avoid immediate store sync if we want a "Save" button in Inspector
// or we can sync live. The plan said "Zero-Modal", implying smooth live or semi-live updates.
let localWidget = $state<any>(null);

$effect(() => {
	if (targetWidget.value && (targetWidget.value as any).widget) {
		localWidget = JSON.parse(JSON.stringify(targetWidget.value));
	} else {
		localWidget = null;
	}
});

function handleSave() {
	if (!localWidget) return;
	onSave(localWidget);
	toast.success("Widget configured");
}

function closeInspector() {
	setTargetWidget({ permissions: {} });
}
</script>

{#if localWidget}
	<aside class="w-80 xl:w-96 flex flex-col border-l border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 shadow-xl overflow-hidden animate-in slide-in-from-right duration-300">
		<!-- Inspector Header -->
		<header class="p-4 border-b border-surface-200 dark:border-surface-800 flex items-center justify-between bg-surface-50/50 dark:bg-surface-800/50">
			<div class="flex items-center gap-3 min-w-0">
				<div class="h-8 w-8 rounded-lg bg-primary-500/10 flex items-center justify-center text-primary-500 shrink-0">
					<iconify-icon icon={localWidget.icon || 'mdi:widgets'} width="18"></iconify-icon>
				</div>
				<div class="min-w-0">
					<h3 class="font-bold text-sm truncate">{localWidget.label || 'Unnamed Field'}</h3>
					<p class="text-[10px] text-surface-500 dark:text-surface-50 uppercase tracking-tighter truncate">{(localWidget.widget as any)?.key || 'Generic'}</p>
				</div>
			</div>
			<Button variant="ghost" size="sm" onclick={closeInspector}>
				<iconify-icon icon="mdi:close" width="20"></iconify-icon>
			</Button>
		</header>

		<!-- Tabs Selector -->
		<div class="p-2 border-b border-surface-200 dark:border-surface-800">
			<SegmentedControl options={tabs} bind:value={activeTab} />
		</div>

		<!-- Content Area -->
		<div class="flex-1 overflow-y-auto p-4 space-y-6">
			{#if activeTab === 'general'}
				<div class="space-y-4">
					<Input label="Field Label" bind:value={localWidget.label} placeholder="e.g. Profile Picture" />
					<Input label="Database Field Name" bind:value={localWidget.db_fieldName} placeholder="e.g. profile_pic" />
					
					<div class="flex items-center justify-between p-3 rounded-xl bg-surface-50 dark:bg-surface-950/50 border border-surface-200 dark:border-surface-800">
						<div>
							<p class="text-sm font-bold text-surface-900 dark:text-white">Required Field</p>
							<p class="text-[10px] text-surface-500 dark:text-surface-50">Must be filled to save content</p>
						</div>
						<input type="checkbox" bind:checked={localWidget.required} class="h-5 w-5 rounded border-surface-300 text-primary-600 focus:ring-primary-500 dark:bg-surface-900 dark:border-surface-700" />
					</div>
				</div>
			{:else if activeTab === 'special'}
				<div class="flex flex-col items-center justify-center h-40 text-surface-400 space-y-2 text-center p-4">
					<iconify-icon icon="mdi:star-outline" width="32" class="opacity-20"></iconify-icon>
					<p class="text-xs">{(localWidget.widget as any)?.key} has no special settings</p>
				</div>
			{:else if activeTab === 'permissions'}
				<div class="space-y-4">
					<p class="text-[10px] font-bold uppercase tracking-widest text-surface-500 dark:text-surface-50">Role Access</p>
					{#each roles as role}
						<div class="flex items-center justify-between p-2 rounded-lg hover:bg-surface-50 dark:hover:bg-surface-800 transition-colors">
							<span class="text-sm">{role.name}</span>
							<input type="checkbox" checked={true} class="h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500 dark:bg-surface-900 dark:border-surface-700" />
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Footer Actions -->
		<footer class="p-4 border-t border-surface-200 dark:border-surface-800 bg-surface-50/50 dark:bg-surface-800/50 flex gap-2">
			<Button variant="primary" class="flex-1" onclick={handleSave} leadingIcon="mdi:check">
				Apply Changes
			</Button>
		</footer>
	</aside>
{/if}
