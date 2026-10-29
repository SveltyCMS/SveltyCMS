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
	import Button from '@components/ui/button.svelte';
	import Badge from '@components/ui/badge.svelte';
	import Modal from '@components/ui/modal.svelte';
	import {
		builder_collapse_all,
		builder_expand_all,
		button_cancel,
		widget_block_add_aria,
		widget_block_ai_generate,
		widget_block_ai_generate_desc,
		widget_block_apply_blueprint,
		widget_block_blueprints,
		widget_block_blueprints_desc,
		widget_block_choose_first,
		widget_block_collapse_all_aria,
		widget_block_content_blocks,
		widget_block_empty_desc,
		widget_block_expand_all_aria,
		widget_block_generate_action,
		widget_block_no_blocks,
		widget_block_payload_json,
		widget_block_prompt_label,
		widget_block_prompt_placeholder,
		widget_block_select_desc,
		widget_block_select_type,
		widget_block_view_editor,
		widget_block_view_wireframe
	} from '@src/paraglide/messages';
	import Input from '@components/ui/input.svelte';
	import Textarea from '@components/ui/textarea.svelte';
	import Select from '@components/ui/select.svelte';
	import { slide } from 'svelte/transition';
	import { DEFAULT_BLOCK_PRESETS, DEFAULT_PAGE_BLUEPRINTS, generateAiLayout } from './index';
	import type {
		BlockInstance,
		BlockTypeDefinition,
		BlockBuilderProps,
		PageBlueprint
	} from './types';
	import { deepClone, generateUUID } from '@utils/native-utils';

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
			: DEFAULT_BLOCK_PRESETS
	);

	// Safe local items reference
	let blocks = $state<BlockInstance[]>([]);
	let showAddModal = $state(false);
	let showBlueprintModal = $state(false);
	let showAiModal = $state(false);
	let viewMode = $state<'editor' | 'wireframe'>('editor');
	let aiPrompt = $state('');

	const quickAiSuggestions = [
		{
			label: '🚀 SaaS Launch with Pricing',
			prompt:
				'High-conversion SaaS product launch with hero, trust logos, features grid, key metrics, pricing comparison, customer testimonial, and call to action'
		},
		{
			label: '🏢 Brand & Company Profile',
			prompt:
				'Editorial corporate brand profile with company mission, executive team media, global scale stats, guiding principles, and careers call to action'
		},
		{
			label: '🌟 Product Deep-Dive',
			prompt:
				'Interactive product feature deep dive with visual media showcase, technical capabilities grid, customer review quote, and deployment CTA'
		},
		{
			label: '❓ FAQ & Knowledge Base',
			prompt:
				'Customer support hub with searchable FAQs on self-hosting, database support, multi-tenant isolation, and community support links'
		},
		{
			label: '📈 Lead Generation',
			prompt:
				'High-conversion enterprise lead capture page with consultation audit offer, performance ROI stats, and customer case study'
		}
	];

	// Synchronize incoming value with local state
	$effect(() => {
		if (value && Array.isArray(value)) {
			blocks = value.map((item) => ({
				...item,
				collapsed: item.collapsed ?? false,
				data: item.data || {}
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
			collapsed: b.collapsed
		}));
	}

	function getBlockMeta(type: string): BlockTypeDefinition {
		const found = availableBlockTypes.find((t) => t.type === type);
		return (
			found || {
				type,
				label: type.charAt(0).toUpperCase() + type.slice(1),
				icon: 'mdi:cube-outline',
				description: 'Custom block element',
				color: 'surface'
			}
		);
	}

	function addBlock(def: BlockTypeDefinition) {
		const newBlock: BlockInstance = {
			_id: generateUUID(),
			_type: def.type,
			data: def.defaultData ? deepClone(def.defaultData) : {},
			collapsed: false
		};
		blocks.push(newBlock);
		commitChanges();
		showAddModal = false;
	}

	function applyBlueprint(blueprint: PageBlueprint) {
		const newBlocks: BlockInstance[] = blueprint.blocks.map((b) => ({
			_id: generateUUID(),
			_type: b.type,
			data: deepClone(b.data),
			collapsed: false
		}));
		blocks = newBlocks;
		commitChanges();
		showBlueprintModal = false;
	}

	function handleAiGenerate() {
		if (!aiPrompt.trim()) return;
		const generated = generateAiLayout(aiPrompt, availableBlockTypes);
		blocks = generated;
		commitChanges();
		showAiModal = false;
		aiPrompt = '';
	}

	function removeBlock(index: number) {
		blocks.splice(index, 1);
		commitChanges();
	}

	function duplicateBlock(index: number) {
		const source = blocks[index];
		if (!source) return;
		const duplicated: BlockInstance = {
			_id: generateUUID(),
			_type: source._type,
			data: deepClone(source.data),
			collapsed: false
		};
		blocks.splice(index + 1, 0, duplicated);
		commitChanges();
	}

	function moveBlock(index: number, direction: 'up' | 'down') {
		const targetIndex = direction === 'up' ? index - 1 : index + 1;
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

	function switchToEditorAndExpand(index: number) {
		viewMode = 'editor';
		if (blocks[index]) {
			blocks[index].collapsed = false;
			commitChanges();
		}
	}

	const isMaxReached = $derived(
		typeof field?.max === 'number' && field.max > 0 && blocks.length >= field.max
	);
</script>

<div class="space-y-4" data-testid="block-builder-container">
	<!-- Header Bar: Block Counter, View Toggle & Action Palette -->
	<div
		class="flex flex-wrap items-center justify-between gap-3 border-b border-surface-500/20 pb-3"
	>
		<!-- Left: Block Count & View Switcher -->
		<div class="flex items-center gap-3">
			<div class="flex items-center gap-2">
				<span class="text-sm font-semibold text-(--admin-text-body)">
					{widget_block_content_blocks()}
				</span>
				<Badge variant="surface" size="sm">
					{blocks.length}{field?.max ? ` / ${field.max}` : ''}
				</Badge>
			</div>

			<!-- View Mode Switcher -->
			<div
				class="inline-flex rounded-lg border border-surface-500/20 bg-surface-500/10 p-0.5"
				role="group"
				aria-label="View Mode"
			>
				<button
					type="button"
					onclick={() => (viewMode = 'editor')}
					class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-hidden {viewMode ===
					'editor'
						? 'bg-primary-500 text-white shadow-xs'
						: 'text-surface-400 hover:text-(--admin-text-body)'}"
					aria-label={widget_block_view_editor()}
					aria-pressed={viewMode === 'editor'}
				>
					<iconify-icon icon="mdi:form-select" width="14"></iconify-icon>
					<span class="hidden sm:inline">{widget_block_view_editor()}</span>
				</button>
				<button
					type="button"
					onclick={() => (viewMode = 'wireframe')}
					class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-hidden {viewMode ===
					'wireframe'
						? 'bg-primary-500 text-white shadow-xs'
						: 'text-surface-400 hover:text-(--admin-text-body)'}"
					aria-label={widget_block_view_wireframe()}
					aria-pressed={viewMode === 'wireframe'}
				>
					<iconify-icon icon="mdi:view-agenda-outline" width="14"></iconify-icon>
					<span class="hidden sm:inline">{widget_block_view_wireframe()}</span>
				</button>
			</div>
		</div>

		<!-- Right: Action Buttons -->
		<div class="flex flex-wrap items-center gap-2">
			<!-- AI Generation Button -->
			<Button
				variant="surface"
				size="sm"
				onclick={() => (showAiModal = true)}
				aria-label={widget_block_ai_generate()}
				class="border border-tertiary-500/30 text-tertiary-500 hover:bg-tertiary-500/10"
			>
				<iconify-icon icon="mdi:creation-outline" width="15" class="me-1.5"></iconify-icon>
				<span>{widget_block_ai_generate()}</span>
			</Button>

			<!-- Blueprints Button -->
			<Button
				variant="surface"
				size="sm"
				onclick={() => (showBlueprintModal = true)}
				aria-label={widget_block_blueprints()}
				class="border border-surface-500/30"
			>
				<iconify-icon icon="mdi:view-grid-plus" width="15" class="me-1.5"></iconify-icon>
				<span>{widget_block_blueprints()}</span>
			</Button>

			{#if viewMode === 'editor' && blocks.length > 1}
				<button
					type="button"
					onclick={() => toggleAll(true)}
					class="rounded px-2 py-1 text-xs text-surface-500 hover:bg-surface-500/10 focus-visible:ring-2 focus-visible:ring-primary-500"
					aria-label={widget_block_collapse_all_aria()}
				>
					{builder_collapse_all()}
				</button>
				<button
					type="button"
					onclick={() => toggleAll(false)}
					class="rounded px-2 py-1 text-xs text-surface-500 hover:bg-surface-500/10 focus-visible:ring-2 focus-visible:ring-primary-500"
					aria-label={widget_block_expand_all_aria()}
				>
					{builder_expand_all()}
				</button>
			{/if}

			<Button
				variant="primary"
				size="sm"
				disabled={isMaxReached}
				onclick={() => (showAddModal = true)}
				aria-label={widget_block_add_aria()}
			>
				<iconify-icon icon="mdi:plus" width="16" class="me-1.5"></iconify-icon>
				{field?.addLabel || 'Add Block'}
			</Button>
		</div>
	</div>

	<!-- Empty State -->
	{#if blocks.length === 0}
		<div
			class="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-surface-500/25 p-8 text-center"
			data-testid="block-builder-empty"
		>
			<div
				class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-500/10 text-primary-500"
			>
				<iconify-icon icon="mdi:view-dashboard-outline" width="24"></iconify-icon>
			</div>
			<h4 class="text-base font-medium text-(--admin-text-body)">
				{widget_block_no_blocks()}
			</h4>
			<p class="mt-1 max-w-sm text-xs text-surface-500">
				{widget_block_empty_desc()}
			</p>
			<div class="mt-4 flex flex-wrap items-center justify-center gap-2">
				<Button variant="primary" size="sm" onclick={() => (showAddModal = true)}>
					<iconify-icon icon="mdi:plus" width="16" class="me-1.5"></iconify-icon>
					{widget_block_choose_first()}
				</Button>
				<Button
					variant="surface"
					size="sm"
					onclick={() => (showBlueprintModal = true)}
					class="border border-surface-500/30"
				>
					<iconify-icon icon="mdi:view-grid-plus" width="15" class="me-1.5"></iconify-icon>
					{widget_block_blueprints()}
				</Button>
				<Button
					variant="surface"
					size="sm"
					onclick={() => (showAiModal = true)}
					class="border border-tertiary-500/30 text-tertiary-500 hover:bg-tertiary-500/10"
				>
					<iconify-icon icon="mdi:creation-outline" width="15" class="me-1.5"></iconify-icon>
					{widget_block_ai_generate()}
				</Button>
			</div>
		</div>
	{/if}

	<!-- View Mode 1: Detailed Field Editor -->
	{#if viewMode === 'editor' && blocks.length > 0}
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
									onclick={() => moveBlock(index, 'up')}
									class="rounded p-0.5 text-surface-400 hover:bg-surface-500/10 disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-primary-500"
									aria-label={`Move ${meta.label} block up`}
								>
									<iconify-icon icon="mdi:chevron-up" width="14"></iconify-icon>
								</button>
								<button
									type="button"
									disabled={index === blocks.length - 1}
									onclick={() => moveBlock(index, 'down')}
									class="rounded p-0.5 text-surface-400 hover:bg-surface-500/10 disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-primary-500"
									aria-label={`Move ${meta.label} block down`}
								>
									<iconify-icon icon="mdi:chevron-down" width="14"></iconify-icon>
								</button>
							</div>

							<!-- Block Icon & Title -->
							<div
								class="flex h-8 w-8 items-center justify-center rounded bg-primary-500/10 text-primary-500"
							>
								<iconify-icon icon={meta.icon} width="18"></iconify-icon>
							</div>
							<div>
								<div class="flex items-center gap-2">
									<span class="text-sm font-semibold text-(--admin-text-body)">
										{meta.label}
									</span>
									<span
										class="rounded bg-surface-500/10 px-1.5 py-0.5 font-mono text-[10px] text-surface-500"
									>
										#{index + 1}
									</span>
								</div>
								{#if block.data && (block.data.headline || block.data.title || block.data.heading || block.data.quote || block.data.question)}
									<p class="truncate max-w-60 text-xs text-surface-400">
										{String(
											block.data.headline ||
												block.data.title ||
												block.data.heading ||
												block.data.quote ||
												block.data.question
										)}
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
								aria-label={block.collapsed
									? `Expand ${meta.label} block`
									: `Collapse ${meta.label} block`}
							>
								<iconify-icon
									icon={block.collapsed ? 'mdi:chevron-down' : 'mdi:chevron-up'}
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
								{#each meta.fields as fieldDef (fieldDef.name)}
									<div class="space-y-1">
										<label
											for={`field_${block._id}_${fieldDef.name}`}
											class="block text-xs font-medium text-(--admin-text-muted)"
										>
											{fieldDef.label}
											{#if fieldDef.required}
												<span class="text-error-500">*</span>
											{/if}
										</label>

										{#if fieldDef.widget === 'textarea'}
											<Textarea
												id={`field_${block._id}_${fieldDef.name}`}
												value={String(block.data[fieldDef.name] ?? '')}
												placeholder={fieldDef.placeholder}
												rows={3}
												oninput={(e) =>
													updateField(
														index,
														fieldDef.name,
														(e.target as HTMLTextAreaElement).value
													)}
											/>
										{:else if fieldDef.widget === 'select' && fieldDef.options}
											<Select
												id={`field_${block._id}_${fieldDef.name}`}
												value={String(block.data[fieldDef.name] ?? fieldDef.defaultValue ?? '')}
												onchange={(val) => updateField(index, fieldDef.name, val)}
											>
												{#each fieldDef.options as opt (opt.value)}
													<option value={opt.value}>{opt.label}</option>
												{/each}
											</Select>
										{:else}
											<Input
												id={`field_${block._id}_${fieldDef.name}`}
												type="text"
												value={String(block.data[fieldDef.name] ?? '')}
												placeholder={fieldDef.placeholder}
												oninput={(e) =>
													updateField(index, fieldDef.name, (e.target as HTMLInputElement).value)}
											/>
										{/if}
									</div>
								{/each}
							{:else}
								<!-- Dynamic JSON fallback for custom blocks without declared fields -->
								<div class="space-y-1">
									<label
										for={`field_${block._id}_raw`}
										class="block text-xs font-medium text-surface-500"
									>
										{widget_block_payload_json()}
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
	{/if}

	<!-- View Mode 2: Visual Wireframe Cards -->
	{#if viewMode === 'wireframe' && blocks.length > 0}
		<div class="space-y-4" data-testid="block-builder-wireframe-view">
			{#each blocks as block, index (block._id)}
				{@const meta = getBlockMeta(block._type)}
				<div
					class="relative rounded-xl border border-surface-500/25 bg-surface-500/10 p-4 transition-all hover:border-primary-500/40 dark:bg-surface-900/20"
				>
					<!-- Wireframe Header Ribbon -->
					<div class="flex items-center justify-between pb-3 mb-3 border-b border-surface-500/15">
						<div class="flex items-center gap-2">
							<span
								class="flex h-6 w-6 items-center justify-center rounded-full bg-primary-500/10 font-mono text-xs font-bold text-primary-500"
							>
								{index + 1}
							</span>
							<div class="flex items-center gap-1.5">
								<iconify-icon icon={meta.icon} width="16" class="text-primary-500"></iconify-icon>
								<span class="text-xs font-bold uppercase tracking-wider text-(--admin-text-body)">
									{meta.label}
								</span>
							</div>
						</div>

						<div class="flex items-center gap-1">
							<button
								type="button"
								disabled={index === 0}
								onclick={() => moveBlock(index, 'up')}
								class="rounded p-1 text-surface-400 hover:bg-surface-500/10 disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-primary-500"
								aria-label={`Move block ${index + 1} up`}
							>
								<iconify-icon icon="mdi:chevron-up" width="16"></iconify-icon>
							</button>
							<button
								type="button"
								disabled={index === blocks.length - 1}
								onclick={() => moveBlock(index, 'down')}
								class="rounded p-1 text-surface-400 hover:bg-surface-500/10 disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-primary-500"
								aria-label={`Move block ${index + 1} down`}
							>
								<iconify-icon icon="mdi:chevron-down" width="16"></iconify-icon>
							</button>
							<Button
								variant="surface"
								size="sm"
								onclick={() => switchToEditorAndExpand(index)}
								aria-label={`Edit ${meta.label} fields`}
								class="ms-1 text-xs py-0.5 px-2"
							>
								<iconify-icon icon="mdi:pencil-outline" width="13" class="me-1"></iconify-icon>
								Edit
							</Button>
							<button
								type="button"
								onclick={() => removeBlock(index)}
								class="rounded p-1 text-error-500 hover:bg-error-500/10 focus-visible:ring-2 focus-visible:ring-error-500 ms-1"
								aria-label={`Delete ${meta.label} block`}
							>
								<iconify-icon icon="mdi:trash-can-outline" width="16"></iconify-icon>
							</button>
						</div>
					</div>

					<!-- Visual Representation of Block Contents -->
					{#if block._type === 'hero'}
						<div
							class="rounded-lg border border-primary-500/20 bg-primary-500/10 p-5 text-center space-y-2"
						>
							<h3 class="text-base font-bold text-(--admin-text-body)">
								{String(block.data.headline || 'Hero Headline')}
							</h3>
							<p class="text-xs text-surface-400 max-w-md mx-auto">
								{String(block.data.subheading || 'Compelling subheadline driving engagement.')}
							</p>
							{#if block.data.buttonText}
								<div class="pt-2">
									<span
										class="inline-block rounded-md bg-primary-500 px-3 py-1 text-xs font-semibold text-white shadow-xs"
									>
										{String(block.data.buttonText)}
									</span>
								</div>
							{/if}
						</div>
					{:else if block._type === 'features'}
						<div class="space-y-3">
							<div class="text-center">
								<h4 class="text-sm font-bold text-(--admin-text-body)">
									{String(block.data.title || 'Features Overview')}
								</h4>
								{#if block.data.description}
									<p class="text-xs text-surface-400">{String(block.data.description)}</p>
								{/if}
							</div>
							<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
								{#each [1, 2, 3] as i (i)}
									<div
										class="rounded-lg border border-surface-500/20 bg-surface-500/10 p-3 text-start"
									>
										<div class="flex items-center gap-1.5 text-success-500 font-semibold text-xs">
											<iconify-icon icon="mdi:check-circle-outline" width="14"></iconify-icon>
											<span>{String(block.data[`feature${i}_title`] || `Feature ${i}`)}</span>
										</div>
										<p class="mt-1 text-[11px] text-surface-400 line-clamp-2">
											{String(block.data[`feature${i}_desc`] || 'Capability description')}
										</p>
									</div>
								{/each}
							</div>
						</div>
					{:else if block._type === 'stats'}
						<div class="space-y-2">
							<h4 class="text-xs font-bold uppercase tracking-wider text-surface-400 text-center">
								{String(block.data.heading || 'Key Metrics')}
							</h4>
							<div class="grid grid-cols-3 gap-2">
								{#each [1, 2, 3] as i (i)}
									<div
										class="rounded-lg border border-tertiary-500/20 bg-tertiary-500/10 p-2.5 text-center"
									>
										<div class="text-base font-bold text-tertiary-500">
											{String(block.data[`stat${i}_value`] || '100%')}
										</div>
										<div class="text-[10px] text-surface-400">
											{String(block.data[`stat${i}_label`] || `Metric ${i}`)}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{:else if block._type === 'pricing'}
						<div class="space-y-2">
							<div class="text-center">
								<h4 class="text-sm font-bold text-(--admin-text-body)">
									{String(block.data.title || 'Pricing Plans')}
								</h4>
							</div>
							<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
								{#each [1, 2, 3] as i (i)}
									<div
										class="rounded-lg border border-warning-500/25 bg-warning-500/10 p-3 text-start space-y-1"
									>
										<div class="flex items-center justify-between">
											<span class="text-xs font-bold text-(--admin-text-body)">
												{String(block.data[`tier${i}_name`] || `Tier ${i}`)}
											</span>
											<span class="text-xs font-bold text-warning-500">
												{String(block.data[`tier${i}_price`] || '$0')}
											</span>
										</div>
										<p class="text-[10px] text-surface-400 line-clamp-2">
											{String(block.data[`tier${i}_features`] || 'Features included')}
										</p>
									</div>
								{/each}
							</div>
						</div>
					{:else if block._type === 'logo-cloud'}
						<div class="rounded-lg border border-surface-500/20 bg-surface-500/10 p-3 text-center">
							<p class="text-xs font-medium text-surface-400 mb-2">
								{String(block.data.headline || 'Trusted Partners')}
							</p>
							<div class="flex flex-wrap items-center justify-center gap-1.5">
								{#each String(block.data.logos || 'Partner A, Partner B, Partner C').split(',') as logo, logoIdx (logoIdx)}
									<span
										class="rounded-md border border-surface-500/25 bg-surface-500/10 px-2 py-0.5 text-[11px] font-mono text-surface-400"
									>
										{logo.trim()}
									</span>
								{/each}
							</div>
						</div>
					{:else if block._type === 'testimonial'}
						<div
							class="rounded-lg border border-primary-500/25 bg-primary-500/10 p-4 text-start relative"
						>
							<iconify-icon icon="mdi:format-quote-open" width="24" class="text-primary-500/40 mb-1"
							></iconify-icon>
							<p class="text-xs italic text-(--admin-text-body)">
								"{String(block.data.quote || 'Customer feedback quote goes here...')}"
							</p>
							<div class="mt-2 text-[11px] font-semibold text-primary-500">
								— {String(block.data.author || 'Author')}{block.data.role
									? `, ${block.data.role}`
									: ''}
							</div>
						</div>
					{:else if block._type === 'faq'}
						<div class="rounded-lg border border-tertiary-500/20 bg-tertiary-500/10 p-3 space-y-1">
							<div class="flex items-center gap-1.5 text-xs font-bold text-(--admin-text-body)">
								<iconify-icon icon="mdi:help-circle" width="14" class="text-tertiary-500"
								></iconify-icon>
								<span>{String(block.data.question || 'Question?')}</span>
							</div>
							<p class="ps-5 text-[11px] text-surface-400">
								{String(block.data.answer || 'Answer copy...')}
							</p>
						</div>
					{:else if block._type === 'cta'}
						<div
							class="rounded-lg border border-warning-500/30 bg-warning-500/10 p-4 text-center space-y-2"
						>
							<h4 class="text-sm font-bold text-(--admin-text-body)">
								{String(block.data.title || 'Call to Action')}
							</h4>
							{#if block.data.description}
								<p class="text-xs text-surface-400">{String(block.data.description)}</p>
							{/if}
							<div class="pt-1 flex items-center justify-center gap-2">
								<span
									class="rounded-md bg-warning-500 px-3 py-1 text-xs font-semibold text-white shadow-xs"
								>
									{String(block.data.primaryText || 'Get Started')}
								</span>
								{#if block.data.secondaryText}
									<span
										class="rounded-md border border-surface-500/30 px-3 py-1 text-xs font-medium text-surface-400"
									>
										{String(block.data.secondaryText)}
									</span>
								{/if}
							</div>
						</div>
					{:else if block._type === 'media'}
						<div class="rounded-lg border border-surface-500/20 bg-surface-500/10 p-3 text-center">
							<div
								class="flex h-24 items-center justify-center rounded border border-dashed border-surface-500/30 bg-surface-500/10 text-surface-400"
							>
								<div class="flex flex-col items-center gap-1">
									<iconify-icon icon="mdi:image-outline" width="24"></iconify-icon>
									<span class="text-[11px]">{String(block.data.altText || 'Media Showcase')}</span>
								</div>
							</div>
							{#if block.data.caption}
								<p class="mt-1.5 text-[11px] text-surface-400 italic">
									{String(block.data.caption)}
								</p>
							{/if}
						</div>
					{:else}
						<!-- Generic fallback wireframe -->
						<div class="rounded-lg border border-surface-500/20 bg-surface-500/10 p-3">
							<p class="text-xs text-surface-400 line-clamp-2">
								{JSON.stringify(block.data)}
							</p>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Modal 1: Add Single Block -->
	{#if showAddModal}
		<Modal bind:open={showAddModal} title={widget_block_select_type()} size="lg" color="surface">
			<p class="text-xs text-surface-500 mb-4">
				{widget_block_select_desc()}
			</p>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pe-1">
				{#each availableBlockTypes as def (def.type)}
					<button
						type="button"
						onclick={() => addBlock(def)}
						class="flex flex-col items-start rounded-lg border border-surface-500/20 p-3.5 text-start transition-all hover:border-primary-500 hover:bg-primary-500/10 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-hidden"
					>
						<div class="flex items-center gap-2.5">
							<div
								class="flex h-8 w-8 items-center justify-center rounded bg-primary-500/10 text-primary-500"
							>
								<iconify-icon icon={def.icon} width="18"></iconify-icon>
							</div>
							<span class="text-sm font-semibold text-(--admin-text-body)">
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

			{#snippet footer()}
				<div class="flex items-center justify-end w-full">
					<Button variant="secondary" size="sm" onclick={() => (showAddModal = false)}>
						{button_cancel()}
					</Button>
				</div>
			{/snippet}
		</Modal>
	{/if}

	<!-- Modal 2: Page Blueprints -->
	{#if showBlueprintModal}
		<Modal
			bind:open={showBlueprintModal}
			title={widget_block_blueprints()}
			size="xl"
			color="surface"
		>
			<p class="text-xs text-surface-500 mb-4">
				{widget_block_blueprints_desc()}
			</p>
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[65vh] overflow-y-auto pe-1">
				{#each DEFAULT_PAGE_BLUEPRINTS as blueprint (blueprint.id)}
					<div
						class="flex flex-col justify-between rounded-xl border border-surface-500/20 bg-surface-500/10 p-4 transition-all hover:border-primary-500/50 hover:shadow-xs"
					>
						<div>
							<div class="flex items-center justify-between gap-2">
								<div class="flex items-center gap-2">
									<div
										class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-500/10 text-primary-500"
									>
										<iconify-icon icon={blueprint.icon} width="20"></iconify-icon>
									</div>
									<h4 class="text-sm font-semibold text-(--admin-text-body)">
										{blueprint.name}
									</h4>
								</div>
								<Badge variant="surface" size="sm" class="uppercase text-[10px]">
									{blueprint.category}
								</Badge>
							</div>
							<p class="mt-2 text-xs text-surface-400">
								{blueprint.description}
							</p>

							<!-- Flow Overview Pills -->
							<div class="mt-3 flex flex-wrap items-center gap-1">
								{#each blueprint.blocks as b, i (i)}
									<span
										class="rounded bg-surface-500/10 px-1.5 py-0.5 text-[10px] font-mono text-surface-400"
									>
										{b.type}
									</span>
									{#if i < blueprint.blocks.length - 1}
										<span class="text-[10px] text-surface-500">→</span>
									{/if}
								{/each}
							</div>
						</div>

						<div class="mt-4 pt-3 border-t border-surface-500/15 flex items-center justify-between">
							<span class="text-xs text-surface-500">
								{blueprint.blocks.length} blocks
							</span>
							<Button variant="primary" size="sm" onclick={() => applyBlueprint(blueprint)}>
								{widget_block_apply_blueprint()}
							</Button>
						</div>
					</div>
				{/each}
			</div>

			{#snippet footer()}
				<div class="flex items-center justify-end w-full">
					<Button variant="secondary" size="sm" onclick={() => (showBlueprintModal = false)}>
						{button_cancel()}
					</Button>
				</div>
			{/snippet}
		</Modal>
	{/if}

	<!-- Modal 3: AI Prompt-to-Layout Generator -->
	{#if showAiModal}
		<Modal bind:open={showAiModal} title={widget_block_ai_generate()} size="lg" color="surface">
			<p class="text-xs text-surface-500 mb-3">
				{widget_block_ai_generate_desc()}
			</p>

			<div class="space-y-3">
				<label for="ai-prompt-input" class="block text-xs font-semibold text-(--admin-text-body)">
					{widget_block_prompt_label()}
				</label>
				<Textarea
					id="ai-prompt-input"
					bind:value={aiPrompt}
					placeholder={widget_block_prompt_placeholder()}
					rows={4}
				/>

				<!-- Quick Chips -->
				<div class="space-y-1.5">
					<span class="text-[11px] font-medium text-surface-500"> Quick Starters: </span>
					<div class="flex flex-wrap gap-1.5">
						{#each quickAiSuggestions as suggestion (suggestion.label)}
							<button
								type="button"
								onclick={() => (aiPrompt = suggestion.prompt)}
								class="rounded-full border border-surface-500/25 bg-surface-500/10 px-2.5 py-1 text-[11px] text-(--admin-text-muted) transition-colors hover:border-tertiary-500 hover:text-tertiary-500 hover:bg-tertiary-500/10 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-hidden"
							>
								{suggestion.label}
							</button>
						{/each}
					</div>
				</div>
			</div>

			{#snippet footer()}
				<div class="flex items-center justify-between w-full">
					<Button variant="secondary" size="sm" onclick={() => (showAiModal = false)}>
						{button_cancel()}
					</Button>
					<Button
						variant="primary"
						size="sm"
						disabled={!aiPrompt.trim()}
						onclick={handleAiGenerate}
					>
						<iconify-icon icon="mdi:creation" width="16" class="me-1.5"></iconify-icon>
						{widget_block_generate_action()}
					</Button>
				</div>
			{/snippet}
		</Modal>
	{/if}
</div>
