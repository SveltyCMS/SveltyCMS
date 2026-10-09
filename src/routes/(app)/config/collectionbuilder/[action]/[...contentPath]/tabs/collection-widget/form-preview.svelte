<!--
@file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-widget/form-preview.svelte
@component
**Interactive Live Entry Form Preview for Collection Builder**

Simulates the real authoring form for the configured collection schema, allowing
creators to test-drive their field layouts, validation badges, and responsive wrapping
before saving to the database.

### Props:
- `items`: WidgetListItem[] (configured field instances)
- `collectionName`: string
- `collectionIcon`: string
- `collectionDescription`: string

### Features:
- Device viewport toggling: Desktop (100%), Tablet (768px), Mobile (390px)
- Sample data generation ("Fill Sample Data" / "Reset")
- Realistic field inputs matching field width options (1/2, 1/3, 2/3, full)
- Accessible labels, help text, placeholders, and required indicators
- WCAG 2.2 AA / WCAG 3.0 compliant with token-based focus rings
-->

<script lang="ts">
	import Button from '@src/components/ui/button.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import {
		builder_required,
		common_clear,
		common_desktop,
		common_mobile,
		common_tablet,
		preview_bold,
		preview_browse,
		preview_bullet_list,
		preview_create_new,
		preview_desktop_aria,
		preview_draft,
		preview_drag_drop_part1,
		preview_fill_sample,
		preview_italic,
		preview_link,
		preview_mobile_aria,
		preview_no_fields,
		preview_no_fields_hint,
		preview_responsive_aria,
		preview_save_entry,
		preview_supports_files,
		preview_tablet_aria,
		preview_viewport_label
	} from '@src/paraglide/messages';
	import type { FieldInstance } from '@src/content/types';

	export type WidgetListItem = FieldInstance & { id: number; _dragId: string };

	let {
		items = [],
		collectionName = 'Collection',
		collectionIcon = 'mdi:widgets',
		collectionDescription = ''
	} = $props<{
		items: WidgetListItem[];
		collectionName?: string;
		collectionIcon?: string;
		collectionDescription?: string;
	}>();

	type ViewportSize = 'desktop' | 'tablet' | 'mobile';
	let viewport = $state<ViewportSize>('desktop');
	let sampleValues = $state<Record<string, any>>({});

	const viewportWidthClass = $derived.by(() => {
		switch (viewport) {
			case 'mobile':
				return 'max-w-[390px]';
			case 'tablet':
				return 'max-w-[768px]';
			case 'desktop':
			default:
				return 'w-full max-w-4xl';
		}
	});

	function getColSpanClass(width?: string): string {
		switch (width) {
			case '1/2':
				return 'col-span-12 sm:col-span-6';
			case '1/3':
				return 'col-span-12 sm:col-span-4';
			case '2/3':
				return 'col-span-12 sm:col-span-8';
			case '1/4':
				return 'col-span-12 sm:col-span-3';
			case 'full':
			default:
				return 'col-span-12';
		}
	}

	function fillSampleData() {
		const mock: Record<string, any> = {};
		for (const item of items) {
			const key = item.db_fieldName || `field_${item.id}`;
			const widgetKey = (
				(item.widget as { key?: string })?.key ||
				(item.widget as { Name?: string })?.Name ||
				''
			).toLowerCase();

			if (widgetKey.includes('number') || widgetKey.includes('currency')) {
				mock[key] = 42;
			} else if (
				widgetKey.includes('check') ||
				widgetKey.includes('bool') ||
				widgetKey.includes('switch')
			) {
				mock[key] = true;
			} else if (widgetKey.includes('date')) {
				mock[key] = new Date().toISOString().slice(0, 10);
			} else if (widgetKey.includes('slug')) {
				mock[key] = 'sample-entry-slug';
			} else if (widgetKey.includes('email')) {
				mock[key] = 'editor@sveltycms.com';
			} else if (
				widgetKey.includes('rich') ||
				widgetKey.includes('markdown') ||
				widgetKey.includes('text')
			) {
				mock[key] =
					`Sample content for ${item.label || 'this field'}. Exploring rich text preview features in SveltyCMS.`;
			} else {
				mock[key] = `Sample ${item.label || 'value'}`;
			}
		}
		sampleValues = mock;
	}

	function clearSampleData() {
		sampleValues = {};
	}
</script>

<div
	class="flex h-full flex-col bg-surface-500/10 dark:bg-surface-900/20 p-4 sm:p-6"
	data-testid="live-form-preview"
>
	<!-- Preview Top Toolbar -->
	<div
		class="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-500/30 bg-white p-3 shadow-2xs dark:border-surface-500/40 dark:bg-surface-900"
	>
		<!-- Left: Viewport Switcher -->
		<div class="flex items-center gap-1">
			<span class="me-2 text-xs font-semibold text-surface-500 dark:text-surface-400"
				>{preview_viewport_label()}</span
			>
			<div
				class="flex items-center rounded-lg border border-surface-500/30 bg-surface-500/10 p-0.5 dark:border-surface-500/40"
				role="group"
				aria-label={preview_responsive_aria()}
			>
				<button
					type="button"
					class="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors {viewport ===
					'desktop'
						? 'bg-white font-bold text-tertiary-600 shadow-xs dark:bg-surface-800 dark:text-primary-500'
						: 'text-surface-600 hover:text-surface-900 dark:text-surface-400'}"
					onclick={() => (viewport = 'desktop')}
					aria-label={preview_desktop_aria()}
				>
					<iconify-icon icon="mdi:monitor" width="16"></iconify-icon>
					<span class="hidden sm:inline">{common_desktop()}</span>
				</button>
				<button
					type="button"
					class="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors {viewport ===
					'tablet'
						? 'bg-white font-bold text-tertiary-600 shadow-xs dark:bg-surface-800 dark:text-primary-500'
						: 'text-surface-600 hover:text-surface-900 dark:text-surface-400'}"
					onclick={() => (viewport = 'tablet')}
					aria-label={preview_tablet_aria()}
				>
					<iconify-icon icon="mdi:tablet" width="16"></iconify-icon>
					<span class="hidden sm:inline">{common_tablet()}</span>
				</button>
				<button
					type="button"
					class="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors {viewport ===
					'mobile'
						? 'bg-white font-bold text-tertiary-600 shadow-xs dark:bg-surface-800 dark:text-primary-500'
						: 'text-surface-600 hover:text-surface-900 dark:text-surface-400'}"
					onclick={() => (viewport = 'mobile')}
					aria-label={preview_mobile_aria()}
				>
					<iconify-icon icon="mdi:cellphone" width="16"></iconify-icon>
					<span class="hidden sm:inline">{common_mobile()}</span>
				</button>
			</div>
		</div>

		<!-- Right: Data Generator Actions -->
		<div class="flex items-center gap-2">
			<Button
				variant="secondary"
				size="sm"
				onclick={fillSampleData}
				leadingIcon="mdi:auto-fix"
				class="text-xs"
			>
				{preview_fill_sample()}
			</Button>
			{#if Object.keys(sampleValues).length > 0}
				<Button
					variant="ghost"
					size="sm"
					onclick={clearSampleData}
					leadingIcon="mdi:refresh"
					class="text-xs"
				>
					{common_clear()}
				</Button>
			{/if}
		</div>
	</div>

	<!-- Interactive Simulation Canvas -->
	<div class="flex flex-1 items-start justify-center overflow-auto pb-8">
		<div
			class="{viewportWidthClass} transition-all duration-300 rounded-2xl border border-surface-500/30 bg-white p-6 shadow-md dark:border-surface-500/40 dark:bg-surface-900"
		>
			<!-- Simulated Form Header -->
			<div class="mb-6 border-b border-surface-500/20 pb-4 dark:border-surface-500/30">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-3">
						<div
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-surface-500/30 bg-tertiary-500/10 text-tertiary-600 dark:border-surface-500/40 dark:bg-surface-800 dark:text-primary-500"
						>
							<iconify-icon icon={collectionIcon || 'mdi:widgets'} width="22"></iconify-icon>
						</div>
						<div>
							<h3 class="text-lg font-bold text-surface-900 dark:text-surface-100">
								{preview_create_new({ name: collectionName || 'Entry' })}
							</h3>
							{#if collectionDescription}
								<p class="text-xs text-surface-500 dark:text-surface-400">
									{collectionDescription}
								</p>
							{/if}
						</div>
					</div>
					<div class="flex items-center gap-2">
						<span
							class="rounded-full border border-warning-500/30 bg-warning-500/10 px-2.5 py-0.5 text-xs font-semibold text-warning-500"
						>
							{preview_draft()}
						</span>
						<Button variant="primary" size="sm" disabled class="opacity-60 text-xs">
							{preview_save_entry()}
						</Button>
					</div>
				</div>
			</div>

			<!-- Empty State -->
			{#if items.length === 0}
				<div class="py-12 text-center">
					<iconify-icon icon="mdi:playlist-remove" width="48" class="mx-auto mb-2 text-surface-400"
					></iconify-icon>
					<h4 class="text-base font-semibold text-surface-600 dark:text-surface-400">
						{preview_no_fields()}
					</h4>
					<p class="text-xs text-surface-500 dark:text-surface-400 mt-1">
						{preview_no_fields_hint()}
					</p>
				</div>
			{:else}
				<!-- Simulated Fields Form Grid -->
				<form onsubmit={(e) => e.preventDefault()} class="grid grid-cols-12 gap-5">
					{#each items as item (item._dragId)}
						{const colSpan = getColSpanClass(item.width)}
						{const key = item.db_fieldName || `field_${item.id}`}
						{const widgetKey = (
							(item.widget as { key?: string })?.key ||
							(item.widget as { Name?: string })?.Name ||
							'input'
						).toLowerCase()}

						<div class="{colSpan} space-y-1.5">
							<!-- Field Label Row -->
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-1.5">
									<label
										for="preview-{key}"
										class="text-sm font-semibold text-surface-600 dark:text-surface-400"
									>
										{item.label || 'Unnamed Field'}
									</label>
									{#if item.required}
										<span class="text-error-500" title={builder_required()}>*</span>
									{/if}
									{#if item.helper}
										<SystemTooltip title={item.helper}>
											<iconify-icon
												icon="mdi:information-outline"
												width="15"
												class="text-surface-400 hover:text-surface-600 dark:hover:text-surface-400 cursor-help"
											></iconify-icon>
										</SystemTooltip>
									{/if}
								</div>
								<span
									class="rounded bg-surface-500/10 px-1.5 py-0.5 text-[9px] font-mono text-surface-500 uppercase dark:text-surface-400"
								>
									{key}
								</span>
							</div>

							<!-- Interactive Widget Input Simulation -->
							{#if widgetKey.includes('checkbox') || widgetKey.includes('switch')}
								<label class="flex items-center gap-2 cursor-pointer pt-1">
									<input
										id="preview-{key}"
										type="checkbox"
										aria-label={item.label || key}
										bind:checked={sampleValues[key]}
										class="h-4 w-4 rounded border-surface-500/30 text-tertiary-500 focus:ring-tertiary-500"
									/>
									<span class="text-sm text-surface-600 dark:text-surface-400">
										{item.placeholder || 'Enable this option'}
									</span>
								</label>
							{:else if widgetKey.includes('media') || widgetKey.includes('image')}
								<div
									class="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-surface-500/30 bg-surface-500/10 p-6 text-center hover:border-tertiary-500/50 transition-colors"
								>
									<iconify-icon
										icon="mdi:cloud-upload-outline"
										width="32"
										class="text-surface-400 mb-2"
									></iconify-icon>
									<p class="text-xs font-medium text-surface-600 dark:text-surface-400">
										{preview_drag_drop_part1()}{' '}<span
											class="text-tertiary-500 dark:text-primary-500 underline"
											>{preview_browse()}</span
										>
									</p>
									<span class="text-[10px] text-surface-400 mt-1">
										{preview_supports_files()}
									</span>
								</div>
							{:else if widgetKey.includes('rich') || widgetKey.includes('markdown')}
								<div
									class="rounded-lg border border-surface-500/30 dark:border-surface-600 overflow-hidden"
								>
									<div
										class="flex items-center gap-1 border-b border-surface-500/20 bg-surface-500/10 px-2 py-1.5 text-surface-600 dark:text-surface-400"
									>
										<button
											type="button"
											class="p-1 hover:bg-surface-500/20 rounded"
											title={preview_bold()}
										>
											<iconify-icon icon="mdi:format-bold" width="16"></iconify-icon>
										</button>
										<button
											type="button"
											class="p-1 hover:bg-surface-500/20 rounded"
											title={preview_italic()}
										>
											<iconify-icon icon="mdi:format-italic" width="16"></iconify-icon>
										</button>
										<button
											type="button"
											class="p-1 hover:bg-surface-500/20 rounded"
											title={preview_link()}
										>
											<iconify-icon icon="mdi:link" width="16"></iconify-icon>
										</button>
										<button
											type="button"
											class="p-1 hover:bg-surface-500/20 rounded"
											title={preview_bullet_list()}
										>
											<iconify-icon icon="mdi:format-list-bulleted" width="16"></iconify-icon>
										</button>
									</div>
									<textarea
										id="preview-{key}"
										rows="4"
										aria-label={item.label || key}
										bind:value={sampleValues[key]}
										placeholder={item.placeholder || 'Enter formatted content...'}
										class="w-full bg-transparent p-3 text-sm focus:outline-none dark:text-white"
									></textarea>
								</div>
							{:else if widgetKey.includes('textarea')}
								<textarea
									id="preview-{key}"
									rows="3"
									aria-label={item.label || key}
									bind:value={sampleValues[key]}
									placeholder={item.placeholder || 'Enter text...'}
									class="w-full rounded-lg border border-surface-500/30 bg-surface-500/10 px-3 py-2 text-sm focus:border-tertiary-500 focus:outline-none dark:border-surface-600 dark:bg-surface-900 dark:text-white"
								></textarea>
							{:else if widgetKey.includes('date')}
								<input
									id="preview-{key}"
									type="date"
									aria-label={item.label || key}
									bind:value={sampleValues[key]}
									class="h-10 w-full rounded-lg border border-surface-500/30 bg-surface-500/10 px-3 text-sm focus:border-tertiary-500 focus:outline-none dark:border-surface-600 dark:bg-surface-900 dark:text-white"
								/>
							{:else if widgetKey.includes('number') || widgetKey.includes('currency')}
								<input
									id="preview-{key}"
									type="number"
									aria-label={item.label || key}
									bind:value={sampleValues[key]}
									placeholder={item.placeholder || '0'}
									class="h-10 w-full rounded-lg border border-surface-500/30 bg-surface-500/10 px-3 text-sm focus:border-tertiary-500 focus:outline-none dark:border-surface-600 dark:bg-surface-900 dark:text-white"
								/>
							{:else}
								<input
									id="preview-{key}"
									type="text"
									aria-label={item.label || key}
									bind:value={sampleValues[key]}
									placeholder={item.placeholder || `Enter ${item.label || 'value'}...`}
									class="h-10 w-full rounded-lg border border-surface-500/30 bg-surface-500/10 px-3 text-sm focus:border-tertiary-500 focus:outline-none dark:border-surface-600 dark:bg-surface-900 dark:text-white"
								/>
							{/if}

							{#if item.helper}
								<p class="text-[11px] text-surface-500 dark:text-surface-400">
									{item.helper}
								</p>
							{/if}
						</div>
					{/each}
				</form>
			{/if}
		</div>
	</div>
</div>
