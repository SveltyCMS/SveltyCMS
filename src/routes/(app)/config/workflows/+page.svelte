<!--
@file src/routes/(app)/config/workflows/+page.svelte
@component Visual State Machine Editor for Content Lifecycles

Free-form canvas: state cards are draggable, the FSM topology is drawn as an SVG
overlay measured from the DOM, and transition labels surface only as tooltips on
their arrows so the canvas stays readable.

### Features:
- drag & drop state cards — positions persist inside the workflow definition
- SVG connectors + arrow markers, re-measured on every layout change
- transition labels shown as hover / focus tooltips on the arrows (click selects)
- inspector for state & transition properties, or a workflow overview when idle
- full Svelte 5 runes; logical (RTL-safe) spacing
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { fade } from 'svelte/transition';
	import { generateUUID } from '@utils/native-utils';
	import type {
		WorkflowDefinition,
		WorkflowState,
		WorkflowTransition
	} from '@src/types/workflow-types';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import Button from '@components/ui/button.svelte';
	import Badge from '@components/ui/badge.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
	import {
		listWorkflowCollections,
		listWorkflowRoles,
		loadWorkflow as loadWorkflowApi,
		saveWorkflowDefinition
	} from './workflows-api';

	/** Default placement grid for cards that carry no persisted position. */
	const CARD_WIDTH = 192; // matches w-48
	const COL_STRIDE = 216;
	const ROW_STRIDE = 220;
	const CANVAS_PAD = 24;
	/** Matches are "content", not a drag handle — let them behave normally. */
	const INTERACTIVE_SELECTOR = 'input, textarea, select, button, a[href], [data-no-drag]';

	let states = $state<WorkflowState[]>([
		{ id: 'draft', label: 'Draft', color: '#94a3b8', isInitial: true },
		{ id: 'review', label: 'In Review', color: '#fbbf24' },
		{ id: 'published', label: 'Published', color: '#22c55e', isFinal: true }
	]);

	let transitions = $state<WorkflowTransition[]>([
		{ id: 't1', from: 'draft', to: 'review', label: 'Submit for Review' },
		{ id: 't2', from: 'review', to: 'published', label: 'Approve & Publish' },
		{ id: 't3', from: 'review', to: 'draft', label: 'Reject' }
	]);

	let selectedNodeId = $state<string | null>(null);
	let selectedTransitionId = $state<string | null>(null);
	let collections = $state<any[]>([]);

	const collectionOptions = $derived(
		collections.map((col) => ({ value: col._id, label: col.name || col._id }))
	);
	let roles = $state<any[]>([]);
	let selectedCollectionId = $state<string>('');
	let workflowId = $state<string | null>(null);
	let workflowName = $state<string>('');
	let workflowDescription = $state<string>('');

	// --- Canvas geometry --------------------------------------------------------
	let canvasEl = $state<HTMLDivElement | null>(null);
	const stateEls = new Map<string, HTMLElement>();
	let hoveredConnectorId = $state<string | null>(null);

	interface Connector {
		id: string;
		d: string;
		label: string;
		lx: number;
		ly: number;
		selected: boolean;
	}
	let connectors = $state<Connector[]>([]);

	/** Pointer drag session — deliberately non-reactive (no re-render per move). */
	let dragSession: {
		id: string;
		pointerId: number;
		startX: number;
		startY: number;
		originX: number;
		originY: number;
		moved: boolean;
	} | null = null;

	/** Fills missing card coordinates with a wrapped grid sized to the canvas. */
	function ensurePositions(force = false): void {
		const width = canvasEl?.clientWidth ?? 960;
		const columns = Math.max(1, Math.floor((width - CANVAS_PAD * 2) / COL_STRIDE));
		states.forEach((state, index) => {
			if (force || typeof state.x !== 'number' || typeof state.y !== 'number') {
				state.x = CANVAS_PAD + (index % columns) * COL_STRIDE;
				state.y = CANVAS_PAD + Math.floor(index / columns) * ROW_STRIDE;
			}
		});
	}

	function registerState(node: HTMLElement, id: string) {
		stateEls.set(id, node);
		return {
			destroy: () => {
				stateEls.delete(id);
			}
		};
	}

	// --- Drag & drop ------------------------------------------------------------
	function onCardPointerDown(event: PointerEvent, state: WorkflowState): void {
		selectNode(state.id);

		// Interacting with content (input / delete button) must not start a drag.
		if ((event.target as HTMLElement | null)?.closest(INTERACTIVE_SELECTOR)) return;
		if (event.button !== 0) return;

		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		dragSession = {
			id: state.id,
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			originX: state.x ?? 0,
			originY: state.y ?? 0,
			moved: false
		};
	}

	function onCardPointerMove(event: PointerEvent): void {
		const drag = dragSession;
		if (!drag || drag.pointerId !== event.pointerId) return;

		const state = states.find((s) => s.id === drag.id);
		if (!state) return;

		const dx = event.clientX - drag.startX;
		const dy = event.clientY - drag.startY;
		// Ignore sub-pixel jitter so a plain click never nudges the card.
		if (!drag.moved && Math.hypot(dx, dy) < 4) return;

		drag.moved = true;
		hoveredConnectorId = null;

		const el = stateEls.get(drag.id);
		const maxX = Math.max(0, (canvasEl?.clientWidth ?? 0) - (el?.offsetWidth ?? CARD_WIDTH));
		const maxY = Math.max(0, (canvasEl?.clientHeight ?? 0) - (el?.offsetHeight ?? 0));
		state.x = Math.min(Math.max(0, drag.originX + dx), maxX);
		state.y = Math.min(Math.max(0, drag.originY + dy), maxY);
	}

	function endCardDrag(event: PointerEvent): void {
		if (dragSession?.pointerId === event.pointerId) dragSession = null;
	}

	// --- Data -------------------------------------------------------------------
	onMount(async () => {
		// Load collections + roles via workflows-api (CSRF-safe fetchApi)
		collections = await listWorkflowCollections();
		roles = await listWorkflowRoles();
	});

	async function loadWorkflow(collectionId: string) {
		if (!collectionId) return;
		const data = await loadWorkflowApi(collectionId);
		if (data.success && data.data) {
			const wf = data.data as WorkflowDefinition;
			workflowId = wf._id || null;
			workflowName = wf.name || '';
			workflowDescription = wf.description || '';
			states = wf.states;
			transitions = wf.transitions;
			ensurePositions();
			toast.success(`Workflow loaded for ${collectionId}`);
		} else {
			workflowId = null;
			workflowName = '';
			workflowDescription = '';
		}
	}

	async function saveWorkflow() {
		if (!selectedCollectionId) {
			toast.error('Please select a collection first');
			return;
		}

		const definition: WorkflowDefinition = {
			_id: workflowId || undefined,
			collectionId: selectedCollectionId,
			name: workflowName || selectedCollectionId,
			description: workflowDescription || undefined,
			states: $state.snapshot(states),
			transitions: $state.snapshot(transitions)
		};

		const data = await saveWorkflowDefinition(definition);
		if (data.success && data.data) {
			workflowId = data.data._id || null;
			toast.success('Workflow saved successfully');
		} else {
			toast.error(data.message || 'Failed to save workflow');
		}
	}

	function addState() {
		const id = `state_${generateUUID()}`;
		states.push({ id, label: 'New State', color: '#3b82f6' });
		ensurePositions();
	}

	function addTransition() {
		if (states.length < 2) return;
		const id = `trans_${generateUUID()}`;
		transitions.push({
			id,
			from: states[0].id,
			to: states[1].id,
			label: 'New Transition'
		});
	}

	function removeState(id: string) {
		states = states.filter((s) => s.id !== id);
		transitions = transitions.filter((t) => t.from !== id && t.to !== id);
		if (selectedNodeId === id) selectedNodeId = null;
		if (!transitions.some((t) => t.id === selectedTransitionId)) selectedTransitionId = null;
	}

	function removeTransition(id: string) {
		transitions = transitions.filter((t) => t.id !== id);
		if (selectedTransitionId === id) selectedTransitionId = null;
	}

	function selectTransition(id: string) {
		selectedTransitionId = id;
		selectedNodeId = null;
	}

	function selectNode(id: string) {
		selectedNodeId = id;
		selectedTransitionId = null;
	}

	// --- Connector rendering ----------------------------------------------------
	/** Point where a ray from the card centre crosses its rectangle border. */
	function edgePoint(
		cx: number,
		cy: number,
		hw: number,
		hh: number,
		dx: number,
		dy: number,
		gap: number
	) {
		const len = Math.hypot(dx, dy) || 1;
		const ux = dx / len;
		const uy = dy / len;
		const tx = ux === 0 ? Number.POSITIVE_INFINITY : hw / Math.abs(ux);
		const ty = uy === 0 ? Number.POSITIVE_INFINITY : hh / Math.abs(uy);
		const t = Math.min(tx, ty) + gap;
		return { x: cx + ux * t, y: cy + uy * t };
	}

	function measure(): void {
		const canvas = canvasEl;
		if (!canvas) return;
		const base = canvas.getBoundingClientRect();
		const boxes = new Map<string, { cx: number; cy: number; hw: number; hh: number }>();
		for (const [id, el] of stateEls) {
			const r = el.getBoundingClientRect();
			boxes.set(id, {
				cx: r.left - base.left + r.width / 2,
				cy: r.top - base.top + r.height / 2,
				hw: r.width / 2,
				hh: r.height / 2
			});
		}

		const seen = new Map<string, number>();
		const next: Connector[] = [];
		for (const t of transitions) {
			const a = boxes.get(t.from);
			const b = boxes.get(t.to);
			if (!a || !b) continue;

			const pairKey = [t.from, t.to].sort().join('>');
			const index = seen.get(pairKey) ?? 0;
			seen.set(pairKey, index + 1);
			const reversed = transitions.some((o) => o.id !== t.id && o.from === t.to && o.to === t.from);

			const dx = b.cx - a.cx;
			const dy = b.cy - a.cy;
			const start = edgePoint(a.cx, a.cy, a.hw, a.hh, dx, dy, 2);
			const end = edgePoint(b.cx, b.cy, b.hw, b.hh, -dx, -dy, 12);

			const mx = (start.x + end.x) / 2;
			const my = (start.y + end.y) / 2;
			let ctrlX = mx;
			let ctrlY = my;
			if (reversed) {
				// Bow opposite transitions to either side so they never overlap.
				const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
				const nx = -(end.y - start.y) / len;
				const ny = (end.x - start.x) / len;
				const bow = 42 + index * 16;
				ctrlX = mx + nx * bow;
				ctrlY = my + ny * bow;
			}
			const d = reversed
				? `M ${start.x} ${start.y} Q ${ctrlX} ${ctrlY} ${end.x} ${end.y}`
				: `M ${start.x} ${start.y} L ${end.x} ${end.y}`;

			next.push({
				id: t.id,
				d,
				label: t.label,
				// Quadratic Bezier at t = 0.5: (P0 + 2C + P2) / 4
				lx: (start.x + 2 * ctrlX + end.x) / 4,
				ly: (start.y + 2 * ctrlY + end.y) / 4,
				selected: selectedTransitionId === t.id
			});
		}
		connectors = next;
	}

	// Re-measure whenever card or transition geometry could have changed.
	const layoutSignature = $derived(
		`${states.map((s) => `${s.id}:${s.label}:${s.x ?? 0}:${s.y ?? 0}`).join('|')}::${transitions
			.map((t) => `${t.id}:${t.from}>${t.to}:${t.label}`)
			.join('|')}::${selectedNodeId ?? ''}::${selectedTransitionId ?? ''}`
	);

	$effect(() => {
		// Touch the signature so the effect re-runs whenever geometry changes.
		void layoutSignature;
		const frame = requestAnimationFrame(measure);
		return () => cancelAnimationFrame(frame);
	});

	// Establish an initial layout before first paint so cards never stack at 0,0.
	ensurePositions();

	onMount(() => {
		// Re-fit the default layout to the real canvas width (unknown at SSR).
		ensurePositions(true);
		const observer = new ResizeObserver(() => measure());
		if (canvasEl) observer.observe(canvasEl);
		window.addEventListener('resize', measure);
		measure();
		return () => {
			observer.disconnect();
			window.removeEventListener('resize', measure);
		};
	});
</script>

<div data-testid="workflows-page" class="contents">
	<AdminPageShell
		title="Workflow Engine"
		icon="mdi:sitemap"
		description="Visual Lifecycle Management (FSM)"
		fullHeight
		spaceY="4"
	>
		{#snippet actions()}
			<Button variant="surface" onclick={addState} data-testid="workflow-add-state"
				>+ Add State</Button
			>
			<Button variant="surface" onclick={addTransition} data-testid="workflow-add-transition"
				>+ Add Transition</Button
			>
			<Button variant="tertiary" onclick={saveWorkflow} data-testid="workflow-save"
				>Save Workflow</Button
			>
		{/snippet}

		<AdminCard
			class="grid grid-cols-1 gap-4 border border-surface-500/30 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3 dark:border-surface-500/40 dark:bg-surface-900"
			data-testid="workflow-toolbar"
		>
			<div data-testid="workflow-collection-select">
				<Select
					bind:value={selectedCollectionId}
					label="Target Collection"
					options={collectionOptions}
					placeholder="Select Collection..."
					size="sm"
					onchange={() => loadWorkflow(selectedCollectionId)}
					class="min-w-48"
				/>
			</div>
			<Input
				bind:value={workflowName}
				label="Workflow Name"
				placeholder="e.g. Blog Review Flow"
				class="min-w-48"
			/>
			<Input
				bind:value={workflowDescription}
				label="Description"
				placeholder="Optional description"
				class="min-w-48"
			/>
			{#if workflowId}
				<span class="text-xs opacity-50" data-testid="workflow-id">id: {workflowId}</span>
			{/if}
		</AdminCard>

		<div
			class="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-4"
			data-testid="workflow-builder"
		>
			<!-- Canvas Area -->
			<div
				class="relative min-h-112 overflow-hidden rounded-2xl border-2 border-dashed border-surface-500/30 bg-surface-500/10 lg:col-span-3 dark:border-surface-500/40 dark:bg-surface-900/50"
				bind:this={canvasEl}
				data-testid="workflow-canvas"
			>
				<!-- Connector overlay — measured from the positioned cards -->
				<svg class="pointer-events-none absolute inset-0 z-0 h-full w-full">
					<defs>
						<marker
							id="wf-arrow"
							viewBox="0 0 10 10"
							refX="9"
							refY="5"
							markerWidth="7"
							markerHeight="7"
							markerUnits="userSpaceOnUse"
							orient="auto-start-reverse"
						>
							<path d="M0,0 L10,5 L0,10 z" class="fill-surface-400 dark:fill-surface-500" />
						</marker>
						<marker
							id="wf-arrow-active"
							viewBox="0 0 10 10"
							refX="9"
							refY="5"
							markerWidth="7"
							markerHeight="7"
							markerUnits="userSpaceOnUse"
							orient="auto-start-reverse"
						>
							<path d="M0,0 L10,5 L0,10 z" class="fill-primary-500" />
						</marker>
					</defs>
					{#each connectors as link (link.id)}
						<path
							d={link.d}
							fill="none"
							stroke-width="2"
							aria-hidden="true"
							class="stroke-surface-400 dark:stroke-surface-500 {link.selected ||
							hoveredConnectorId === link.id
								? 'stroke-primary-500! dark:stroke-primary-500!'
								: ''}"
							marker-end={link.selected ? 'url(#wf-arrow-active)' : 'url(#wf-arrow)'}
						/>
					{/each}
					<!-- Generous invisible hit area: hover shows the label, click selects. -->
					{#each connectors as link (link.id)}
						<path
							d={link.d}
							fill="none"
							stroke="transparent"
							stroke-width="18"
							pointer-events="stroke"
							role="button"
							tabindex="0"
							aria-label={link.label}
							onmouseenter={() => (hoveredConnectorId = link.id)}
							onmouseleave={() => {
								if (hoveredConnectorId === link.id) hoveredConnectorId = null;
							}}
							onfocus={() => (hoveredConnectorId = link.id)}
							onblur={() => {
								if (hoveredConnectorId === link.id) hoveredConnectorId = null;
							}}
							onclick={() => selectTransition(link.id)}
							onkeydown={(event) => {
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault();
									selectTransition(link.id);
								}
							}}
						/>
					{/each}
				</svg>

				{#each states as state (state.id)}
					<div
						use:registerState={state.id}
						role="button"
						tabindex="0"
						data-testid={`workflow-state-${state.id}`}
						aria-label={`State: ${state.label}`}
						class="group absolute z-10 w-48 cursor-grab touch-none rounded border-2 bg-white p-4 shadow-lg transition-[border-color,box-shadow] duration-200 active:cursor-grabbing dark:bg-surface-800
                            {selectedNodeId === state.id
							? 'border-primary-500 shadow-xl ring-4 ring-primary-500/10'
							: 'border-surface-500/30 dark:border-surface-500/40'}"
						style="left: {state.x ?? 0}px; top: {state.y ?? 0}px;"
						onpointerdown={(event) => onCardPointerDown(event, state)}
						onpointermove={onCardPointerMove}
						onpointerup={endCardDrag}
						onpointercancel={endCardDrag}
						onkeydown={(event) => {
							if (event.key === 'Enter' || event.key === ' ') {
								event.preventDefault();
								selectNode(state.id);
							}
						}}
					>
						{#if state.isInitial}
							<span
								class="absolute -top-3 inset-s-1/2 -translate-x-1/2 rounded-full bg-primary-500 px-2 py-0.5 text-xs font-bold uppercase text-white"
								>Initial</span
							>
						{/if}

						<!-- Status dot + title share one row -->
						<div class="mb-3 flex items-center gap-2">
							<span
								class="h-3 w-3 shrink-0 rounded-full"
								style:background-color={state.color}
								aria-hidden="true"
							></span>
							<div class="min-w-0 flex-1">
								<Input
									bind:value={state.label}
									aria-label="State name"
									inputClass="h-8 border-none bg-transparent px-0 text-sm font-semibold shadow-none focus-visible:ring-0"
								/>
							</div>
							<button
								type="button"
								class="text-error-500 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
								title="Delete state"
								aria-label={`Delete state ${state.label}`}
								onclick={() => removeState(state.id)}>×</button
							>
						</div>

						<!-- Outgoing transitions (labels live on the arrows as tooltips) -->
						{#if transitions.some((t) => t.from === state.id)}
							<div class="space-y-1">
								{#each transitions.filter((t) => t.from === state.id) as trans (trans.id)}
									<button
										type="button"
										title={trans.label}
										class="flex w-full items-center gap-2 rounded border bg-surface-500/10 p-1.5 text-start text-xs dark:bg-surface-900
                                           {selectedTransitionId === trans.id
											? 'border-primary-500 ring-1 ring-primary-500/50'
											: 'border-surface-500/30 hover:border-surface-500'}"
										onclick={(event) => {
											event.stopPropagation();
											selectTransition(trans.id);
										}}
									>
										<span class="truncate"
											>➔ {states.find((s) => s.id === trans.to)?.label ?? trans.to}</span
										>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{/each}

				<!-- Transition label tooltips (hover / focus on an arrow, or selected) -->
				<div class="pointer-events-none absolute inset-0 z-20">
					{#each connectors as link (link.id)}
						{#if link.label && (link.selected || hoveredConnectorId === link.id)}
							<span
								role="tooltip"
								class="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium shadow-sm {link.selected
									? 'border-primary-500 bg-primary-500 text-white'
									: 'border-surface-500/40 bg-white text-surface-700 dark:bg-surface-800 dark:text-surface-200'}"
								style="left: {link.lx}px; top: {link.ly}px;"
							>
								{link.label}
							</span>
						{/if}
					{/each}
				</div>
			</div>

			<!-- Properties Inspector -->
			<AdminCard
				class="overflow-y-auto border border-surface-500/30 bg-white p-6 shadow-sm dark:border-surface-500/40 dark:bg-surface-900"
			>
				<h3 class="mb-6 text-xs font-bold uppercase tracking-widest opacity-40">Properties</h3>

				{#if selectedNodeId}
					{const node = states.find((s) => s.id === selectedNodeId)}
					{#if node}
						<div class="space-y-6" in:fade>
							<Badge variant="primary" size="sm">State: {node.id}</Badge>
							<Input id="state-name" bind:value={node.label} label="Display Label" />
							<Input
								id="accent-color"
								type="color"
								bind:value={node.color}
								label="Accent Color"
								inputClass="h-10 cursor-pointer border-none p-0"
							/>
							<div class="flex flex-col gap-3">
								<Checkbox
									bind:checked={node.isInitial}
									label="Initial State"
									size="sm"
									onchange={(checked) => {
										if (checked)
											states.forEach((s) => {
												if (s.id !== node.id) s.isInitial = false;
											});
									}}
								/>
								<Checkbox bind:checked={node.isFinal} label="Final State" size="sm" />
							</div>
							<Button
								variant="error"
								onclick={() => {
									removeState(node.id);
									selectedNodeId = null;
								}}
								size="sm"
								class="mt-4 w-full">Delete State</Button
							>
						</div>
					{/if}
				{:else if selectedTransitionId}
					{const trans = transitions.find((t) => t.id === selectedTransitionId)}
					{#if trans}
						<div class="space-y-6" in:fade>
							<Badge variant="secondary" size="sm">Transition: {trans.id}</Badge>
							<Input id="trans-label" bind:value={trans.label} label="Button Label" />
							<Select
								bind:value={trans.from}
								label="From State"
								size="sm"
								options={states.map((s) => ({ value: s.id, label: s.label }))}
							/>
							<Select
								bind:value={trans.to}
								label="To State"
								size="sm"
								options={states.map((s) => ({ value: s.id, label: s.label }))}
							/>
							<Select
								bind:value={trans.requiredRole}
								label="Required Role (RBAC)"
								size="sm"
								description="User must have this role to trigger this transition."
								options={[
									{ value: '', label: 'No Role (Anyone)' },
									{ value: 'admin', label: 'Administrator' },
									...roles.map((role) => ({ value: role._id, label: role.name || role._id }))
								]}
							/>
							<Button
								variant="error"
								onclick={() => {
									removeTransition(trans.id);
									selectedTransitionId = null;
								}}
								size="sm"
								class="mt-4 w-full">Delete Transition</Button
							>
						</div>
					{/if}
				{:else}
					<div class="space-y-6">
						<div
							class="rounded border border-surface-500/30 bg-surface-500/10 p-4 dark:border-surface-500/40"
						>
							<p class="mb-2 text-sm font-semibold">{workflowName || 'Untitled workflow'}</p>
							<ul class="space-y-1 text-xs opacity-70">
								<li>{states.length} state{states.length === 1 ? '' : 's'}</li>
								<li>{transitions.length} transition{transitions.length === 1 ? '' : 's'}</li>
								<li>
									{selectedCollectionId
										? `Collection: ${collectionOptions.find((o) => o.value === selectedCollectionId)?.label ?? selectedCollectionId}`
										: 'No collection selected'}
								</li>
							</ul>
						</div>
						<div
							class="flex flex-col items-center justify-center py-4 text-center italic opacity-40"
						>
							<iconify-icon icon="mdi:gesture-tap" width="40" class="mb-3"></iconify-icon>
							<p class="text-sm font-medium">
								Select a state or transition on the canvas to edit its properties
							</p>
						</div>
					</div>
				{/if}
			</AdminCard>
		</div>
	</AdminPageShell>
</div>
