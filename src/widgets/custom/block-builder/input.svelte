<!--
@file src/widgets/custom/block-builder/input.svelte
@description Visual Block Builder input component for composing polymorphic layout blocks.
@component
@props {BlockBuilderProps} field - Widget configuration options.
@props {BlockInstance[]} value - Bound block instances.
@props {string} [collectionName] - Collection context.
@props {string | null} [tenantId] - Multi-tenant context.
-->
<script lang="ts">
	import Button from "@components/ui/button.svelte";
	import Badge from "@components/ui/badge.svelte";
	import Input from "@components/ui/input.svelte";
	import Textarea from "@components/ui/textarea.svelte";
	import Select from "@components/ui/select.svelte";
	import { slide } from "svelte/transition";
	import { DEFAULT_BLOCK_PRESETS } from "./index";
	import type { BlockInstance, BlockTypeDefinition, BlockBuilderProps } from "./types";

	interface Props {
		collectionName?: string;
		field?: BlockBuilderProps;
		tenantId?: string | null;
		value?: BlockInstance[] | null;
	}

	let { field, value = $bindable([]) }: Props = $props();

	// Active block templates: custom defined in field or system presets
	const availableBlockTypes: BlockTypeDefinition[] = $derived(
		field?.blocks && Array.isArray(field.blocks) && field.blocks.length > 0
			? field.blocks
			: DEFAULT_BLOCK_PRESETS,
	);

	// Safe local items reference
	let blocks = $state<BlockInstance[]>([]);
	let showAddModal = $state(false);

	// Synchronize incoming value with local state
	$effect(() => {
		if (value && Array.isArray(value)) {
			blocks = value.map((item) => ({
				...item,
				collapsed: item.collapsed ?? false,
				data: item.data || {},
			}));
		} else {
			blocks = [];
		}
	});

	function commitChanges() {
		value = blocks.map((b) => ({
			_id: b._id,
			_type: b._type,
			data: { ...b.data },
			collapsed: b.collapsed,
		}));
	}

	function getBlockMeta(type: string): BlockTypeDefinition {
		const found = availableBlockTypes.find((t) => t.type === type);
		return (
			found || {
				type,
				label: type.charAt(0).toUpperCase() + type.slice(1),
				icon: "mdi:cube-outline",
				description: "Custom block element",
				color: "surface",
			}
		);
	}

	function addBlock(def: BlockTypeDefinition) {
		const newBlock: BlockInstance = {
			_id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `blk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
			_type: def.type,
			data: def.defaultData ? JSON.parse(JSON.stringify(def.defaultData)) : {},
			collapsed: false,
		};
		blocks.push(newBlock);
		commitChanges();
		showAddModal = false;
	}

	function removeBlock(index: number) {
		blocks.splice(index, 1);
		commitChanges();
	}

	function duplicateBlock(index: number) {
		const source = blocks[index];
		if (!source) return;
		const duplicated: BlockInstance = {
			_id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `blk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
			_type: source._type,
			data: JSON.parse(JSON.stringify(source.data)),
			collapsed: false,
		};
		blocks.splice(index + 1, 0, duplicated);
		commitChanges();
	}

	function moveBlock(index: number, direction: "up" | "down") {
		const targetIndex = direction === "up" ? index - 1 : index + 1;
		if (targetIndex < 0 || targetIndex >= blocks.length) return;
		const [moved] = blocks.splice(index, 1);
		blocks.splice(targetIndex, 0, moved);
		commitChanges();
	}

	function toggleCollapse(index: number) {
		blocks[index].collapsed = !blocks[index].collapsed;
		commitChanges();
	}

	function toggleAll(collapse: boolean) {
		for (const b of blocks) {
			b.collapsed = collapse;
		}
		commitChanges();
	}

	function updateField(blockIndex: number, fieldName: string, val: unknown) {
		if (!blocks[blockIndex].data) {
			blocks[blockIndex].data = {};
		}
		blocks[blockIndex].data[fieldName] = val;
		commitChanges();
	}

	const isMaxReached = $derived(
		typeof field?.max === "number" && field.max > 0 && blocks.length >= field.max,
	);
</script>

<div class="space-y-4" data-testid="block-builder-container">
	<!-- Header Bar: Block Counter & Global Controls -->
	<div class="flex flex-wrap items-center justify-between gap-3 border-b border-surface-500/20 pb-3">
		<div class="flex items-center gap-2">
			<span class="text-sm font-semibold text-surface-900 dark:text-surface-50">
				Content Blocks
			</span>
			<Badge variant="surface" size="sm">
				{blocks.length}{field?.max ? ` / ${field.max}` : ""}
			</Badge>
		</div>

		<div class="flex items-center gap-2">
			{#if blocks.length > 1}
				<button
					type="button"
					onclick={() => toggleAll(true)}
					class="rounded px-2 py-1 text-xs text-surface-500 hover:bg-surface-500/10 focus-visible:ring-2 focus-visible:ring-primary-500"
					aria-label="Collapse all blocks"
				>
					Collapse All
				</button>
				<button
					type="button"
					onclick={() => toggleAll(false)}
					class="rounded px-2 py-1 text-xs text-surface-500 hover:bg-surface-500/10 focus-visible:ring-2 focus-visible:ring-primary-500"
					aria-label="Expand all blocks"
				>
					Expand All
				</button>
			{/if}

			<Button
				variant="primary"
				size="sm"
				disabled={isMaxReached}
				onclick={() => (showAddModal = true)}
				aria-label="Add a new content block"
			>
				<iconify-icon icon="mdi:plus" width="16" class="me-1.5"></iconify-icon>
				{field?.addLabel || "Add Block"}
			</Button>
		</div>
	</div>

	<!-- Empty State -->
	{#if blocks.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-surface-500/25 p-8 text-center"
			data-testid="block-builder-empty"
		>
			<div class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-500/10 text-primary-500">
				<iconify-icon icon="mdi:view-dashboard-outline" width="24"></iconify-icon>
			</div>
			<h4 class="text-base font-medium text-surface-900 dark:text-surface-100">
				No blocks added yet
			</h4>
			<p class="mt-1 max-w-sm text-xs text-surface-500">
				Compose dynamic landing pages, marketing banners, testimonials, and media showcases using modular content blocks.
			</p>
			<Button
				variant="secondary"
				size="sm"
				class="mt-4"
				onclick={() => (showAddModal = true)}
			>
				<iconify-icon icon="mdi:plus" width="16" class="me-1.5"></iconify-icon>
				Choose First Block
			</Button>
		</div>
	{/if}

	<!-- Block List -->
	<div class="space-y-3">
		{#each blocks as block, index (block._id)}
			{@const meta = getBlockMeta(block._type)}
			<div
				class="rounded-lg border border-surface-500/20 bg-surface-500/10 shadow-xs transition-shadow dark:bg-surface-900/20"
				data-testid="block-item-{block._type}"
			>
				<!-- Block Header -->
				<div class="flex items-center justify-between border-b border-surface-500/15 p-3">
					<div class="flex items-center gap-2 text-start">
						<!-- Reorder Buttons -->
						<div class="flex flex-col gap-0.5">
							<button
								type="button"
								disabled={index === 0}
								onclick={() => moveBlock(index, "up")}
								class="rounded p-0.5 text-surface-400 hover:bg-surface-500/10 disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-primary-500"
								aria-label={`Move ${meta.label} block up`}
							>
								<iconify-icon icon="mdi:chevron-up" width="14"></iconify-icon>
							</button>
							<button
								type="button"
								disabled={index === blocks.length - 1}
								onclick={() => moveBlock(index, "down")}
								class="rounded p-0.5 text-surface-400 hover:bg-surface-500/10 disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-primary-500"
								aria-label={`Move ${meta.label} block down`}
							>
								<iconify-icon icon="mdi:chevron-down" width="14"></iconify-icon>
							</button>
						</div>

						<!-- Block Icon & Title -->
						<div class="flex h-8 w-8 items-center justify-center rounded bg-primary-500/10 text-primary-500">
							<iconify-icon icon={meta.icon} width="18"></iconify-icon>
						</div>
						<div>
							<div class="flex items-center gap-2">
								<span class="text-sm font-semibold text-surface-900 dark:text-surface-100">
									{meta.label}
								</span>
								<span class="rounded bg-surface-500/10 px-1.5 py-0.5 font-mono text-[10px] text-surface-500">
									#{index + 1}
								</span>
							</div>
							{#if block.data && (block.data.headline || block.data.title || block.data.heading || block.data.quote)}
								<p class="truncate max-w-60 text-xs text-surface-400">
									{String(block.data.headline || block.data.title || block.data.heading || block.data.quote)}
								</p>
							{/if}
						</div>
					</div>

					<!-- Block Actions -->
					<div class="flex items-center gap-1">
						<!-- Toggle Collapse -->
						<button
							type="button"
							onclick={() => toggleCollapse(index)}
							class="rounded p-1.5 text-surface-400 hover:bg-surface-500/10 focus-visible:ring-2 focus-visible:ring-primary-500"
							aria-label={block.collapsed ? `Expand ${meta.label} block` : `Collapse ${meta.label} block`}
						>
							<iconify-icon
								icon={block.collapsed ? "mdi:chevron-down" : "mdi:chevron-up"}
								width="18"
							></iconify-icon>
						</button>

						<!-- Duplicate -->
						<button
							type="button"
							disabled={isMaxReached}
							onclick={() => duplicateBlock(index)}
							class="rounded p-1.5 text-surface-400 hover:bg-surface-500/10 disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-primary-500"
							aria-label={`Duplicate ${meta.label} block`}
						>
							<iconify-icon icon="mdi:content-copy" width="16"></iconify-icon>
						</button>

						<!-- Delete -->
						<button
							type="button"
							onclick={() => removeBlock(index)}
							class="rounded p-1.5 text-error-500 hover:bg-error-500/10 focus-visible:ring-2 focus-visible:ring-error-500"
							aria-label={`Delete ${meta.label} block`}
						>
							<iconify-icon icon="mdi:trash-can-outline" width="16"></iconify-icon>
						</button>
					</div>
				</div>

				<!-- Block Fields Content -->
				{#if !block.collapsed}
					<div transition:slide={{ duration: 150 }} class="p-4 space-y-3">
						{#if meta.fields && meta.fields.length > 0}
							{#each meta.fields as fieldDef}
								<div class="space-y-1">
									<label
										for={`field_${block._id}_${fieldDef.name}`}
										class="block text-xs font-medium text-surface-600 dark:text-surface-400"
									>
										{fieldDef.label}
										{#if fieldDef.required}
											<span class="text-error-500">*</span>
										{/if}
									</label>

									{#if fieldDef.widget === "textarea"}
										<Textarea
											id={`field_${block._id}_${fieldDef.name}`}
											value={String(block.data[fieldDef.name] ?? "")}
											placeholder={fieldDef.placeholder}
											rows={3}
											oninput={(e) => updateField(index, fieldDef.name, (e.target as HTMLTextAreaElement).value)}
										/>
									{:else if fieldDef.widget === "select" && fieldDef.options}
										<Select
											id={`field_${block._id}_${fieldDef.name}`}
											value={String(block.data[fieldDef.name] ?? fieldDef.defaultValue ?? "")}
											onchange={(val) => updateField(index, fieldDef.name, val)}
										>
											{#each fieldDef.options as opt}
												<option value={opt.value}>{opt.label}</option>
											{/each}
										</Select>
									{:else}
										<Input
											id={`field_${block._id}_${fieldDef.name}`}
											type="text"
											value={String(block.data[fieldDef.name] ?? "")}
											placeholder={fieldDef.placeholder}
											oninput={(e) => updateField(index, fieldDef.name, (e.target as HTMLInputElement).value)}
										/>
									{/if}
								</div>
							{/each}
						{:else}
							<!-- Dynamic JSON fallback for custom blocks without declared fields -->
							<div class="space-y-1">
								<label for={`field_${block._id}_raw`} class="block text-xs font-medium text-surface-500">
									Block Payload (JSON)
								</label>
								<Textarea
									id={`field_${block._id}_raw`}
									value={JSON.stringify(block.data, null, 2)}
									rows={4}
									onchange={(e) => {
										try {
											const parsed = JSON.parse((e.target as HTMLTextAreaElement).value);
											blocks[index].data = parsed;
											commitChanges();
										} catch {}
									}}
								/>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Add Block Modal / Palette -->
	{#if showAddModal}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-add-block-title"
		>
			<div class="w-full max-w-xl rounded-xl border border-surface-500/25 bg-surface-500/10 p-6 shadow-xl dark:bg-surface-900">
				<div class="flex items-center justify-between pb-4 border-b border-surface-500/15">
					<div>
						<h3 id="modal-add-block-title" class="text-base font-semibold text-surface-900 dark:text-surface-50">
							Select Block Type
						</h3>
						<p class="text-xs text-surface-500">
							Choose a content block to add to your layout composition.
						</p>
					</div>
					<button
						type="button"
						onclick={() => (showAddModal = false)}
						class="rounded p-1 text-surface-400 hover:bg-surface-500/10 focus-visible:ring-2 focus-visible:ring-primary-500"
						aria-label="Close dialog"
					>
						<iconify-icon icon="mdi:close" width="20"></iconify-icon>
					</button>
				</div>

				<div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
					{#each availableBlockTypes as def}
						<button
							type="button"
							onclick={() => addBlock(def)}
							class="flex flex-col items-start rounded-lg border border-surface-500/20 p-3.5 text-start transition-all hover:border-primary-500 hover:bg-primary-500/10 focus-visible:ring-2 focus-visible:ring-primary-500"
						>
							<div class="flex items-center gap-2.5">
								<div class="flex h-8 w-8 items-center justify-center rounded bg-primary-500/10 text-primary-500">
									<iconify-icon icon={def.icon} width="18"></iconify-icon>
								</div>
								<span class="text-sm font-semibold text-surface-900 dark:text-surface-100">
									{def.label}
								</span>
							</div>
							{#if def.description}
								<p class="mt-1.5 text-xs text-surface-500">
									{def.description}
								</p>
							{/if}
						</button>
					{/each}
				</div>

				<div class="mt-6 flex justify-end border-t border-surface-500/15 pt-4">
					<Button variant="secondary" size="sm" onclick={() => (showAddModal = false)}>
						Cancel
					</Button>
				</div>
			</div>
		</div>
	{/if}
</div>
