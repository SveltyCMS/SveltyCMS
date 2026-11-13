<!--
@file src/routes/(app)/config/workflows/+page.svelte
@component Visual State Machine Editor for Content Lifecycles

Professional free-form canvas with:
- draggable state cards (positions persist)
- SVG connectors + always-visible labels
- connection ports + drag-from-port to create transitions
- zoom + pan + reset viewport controls
- keyboard shortcuts (Delete, Escape, arrow-key positioning)
- confirmation dialog before deleting states with transitions
- clean inspector & auto-layout
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { fade } from 'svelte/transition';
	import { generateUUID } from '@utils/native-utils';
	import { showConfirm } from '@utils/modal.svelte';
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
	import Tooltip from '@components/ui/tooltip.svelte';
	import HelpIcon from '@components/ui/help-icon.svelte';
	import {
		loadWorkflow as loadWorkflowApi,
		saveWorkflowDefinition,
		type WorkflowCollectionOption,
		type WorkflowRoleOption
	} from './workflows-api';
	import {
		workflows_add_state,
		workflows_add_transition,
		workflows_collection_placeholder,
		workflows_delete_state,
		workflows_delete_state_aria,
		workflows_delete_transition,
		workflows_description_placeholder,
		workflows_initial,
		workflows_inspector_hint,
		workflows_name_placeholder,
		workflows_properties,
		workflows_save,
		workflows_state_label,
		workflows_state_plural,
		workflows_state_singular,
		workflows_title,
		workflows_transition_label,
		workflows_transition_plural,
		workflows_transition_singular
	} from '@src/paraglide/messages';

	const CARD_WIDTH = 220;
	const COL_STRIDE = 280;
	const ROW_STRIDE = 200;
	const CANVAS_PAD = 48;
	const INTERACTIVE_SELECTOR = 'input, textarea, select, button, a[href], [data-no-drag]';

	let { data } = $props();

	/**
	 * Starter state machine: shown before a collection is selected and for a
	 * collection that has no stored workflow. Built per call so assigning it to
	 * `$state` never shares node objects between loads.
	 */
	function createStarterWorkflow(): {
		states: WorkflowState[];
		transitions: WorkflowTransition[];
	} {
		return {
			states: [
				{ id: 'draft', label: 'Draft', color: '#94a3b8', isInitial: true },
				{ id: 'review', label: 'In Review', color: '#fbbf24' },
				{ id: 'published', label: 'Published', color: '#22c55e', isFinal: true }
			],
			transitions: [
				{ id: 't1', from: 'draft', to: 'review', label: 'Submit for Review' },
				{ id: 't2', from: 'review', to: 'published', label: 'Approve & Publish' },
				{ id: 't3', from: 'review', to: 'draft', label: 'Reject' }
			]
		};
	}

	const starterWorkflow = createStarterWorkflow();
	let states = $state<WorkflowState[]>(starterWorkflow.states);
	let transitions = $state<WorkflowTransition[]>(starterWorkflow.transitions);

	let selectedNodeId = $state<string | null>(null);
	let selectedTransitionId = $state<string | null>(null);
	let collections = $state<WorkflowCollectionOption[]>(untrack(() => data.collections));

	const collectionOptions = $derived(
		collections.map((col) => ({ value: col._id, label: col.name || col._id }))
	);
	let roles = $state<WorkflowRoleOption[]>(untrack(() => data.roles));
	const roleOptions = $derived(
		roles
			.filter((role) => Boolean(role._id ?? role.id))
			.map((role) => ({
				value: String(role._id ?? role.id),
				label: role.name || String(role._id ?? role.id)
			}))
	);
	let selectedCollectionId = $state<string>('');
	let workflowId = $state<string | null>(null);
	let workflowName = $state<string>('');
	let workflowDescription = $state<string>('');

	// --- Zoom & Pan -------------------------------------------------------------
	let zoom = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let isPanning = $state(false);
	let panStart = { x: 0, y: 0, originX: 0, originY: 0 };

	function zoomIn() {
		zoom = Math.min(2, Math.round((zoom + 0.15) * 100) / 100);
	}

	function zoomOut() {
		zoom = Math.max(0.5, Math.round((zoom - 0.15) * 100) / 100);
	}

	function resetViewport() {
		zoom = 1;
		panX = 0;
		panY = 0;
	}

	function onCanvasPointerDown(e: PointerEvent) {
		if (e.button === 1 || (e.button === 0 && e.altKey)) {
			// Middle click or Alt+click pans the canvas
			e.preventDefault();
			isPanning = true;
			panStart = { x: e.clientX, y: e.clientY, originX: panX, originY: panY };
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		} else if (e.target === canvasEl || (e.target as HTMLElement).id === 'wf-grid-bg') {
			selectedNodeId = null;
			selectedTransitionId = null;
		}
	}

	function onCanvasPointerMove(e: PointerEvent) {
		if (isPanning) {
			panX = panStart.originX + (e.clientX - panStart.x);
			panY = panStart.originY + (e.clientY - panStart.y);
			return;
		}
		if (portDrag) {
			const rect = canvasEl?.getBoundingClientRect();
			if (rect) {
				portDrag.currentX = (e.clientX - rect.left - panX) / zoom;
				portDrag.currentY = (e.clientY - rect.top - panY) / zoom;
			}
		}
	}

	function onCanvasPointerUp(e: PointerEvent) {
		if (isPanning) {
			isPanning = false;
		}
		if (portDrag) {
			endPortDrag(e);
		}
	}

	// --- Drag from Port (New Transition) ----------------------------------------
	let portDrag = $state<{
		fromId: string;
		startX: number;
		startY: number;
		currentX: number;
		currentY: number;
	} | null>(null);

	function startPortDrag(event: PointerEvent, fromState: WorkflowState) {
		event.stopPropagation();
		event.preventDefault();
		const el = stateEls.get(fromState.id);
		const rect = canvasEl?.getBoundingClientRect();
		if (!el || !rect) return;

		const startX = (fromState.x ?? 0) + (el.offsetWidth || CARD_WIDTH);
		const startY = (fromState.y ?? 0) + (el.offsetHeight / 2 || 60);

		portDrag = {
			fromId: fromState.id,
			startX,
			startY,
			currentX: (event.clientX - rect.left - panX) / zoom,
			currentY: (event.clientY - rect.top - panY) / zoom
		};
	}

	function endPortDrag(event: PointerEvent) {
		if (!portDrag) return;
		const fromId = portDrag.fromId;
		portDrag = null;

		// Check drop target element under cursor
		const targetEl = document.elementFromPoint(event.clientX, event.clientY);
		const stateCard = targetEl?.closest('[data-wf-state-id]');
		const toId = stateCard?.getAttribute('data-wf-state-id');

		if (toId && toId !== fromId) {
			// Create transition
			const id = `trans_${generateUUID()}`;
			const toState = states.find((s) => s.id === toId);
			const label = toState ? `To ${toState.label}` : 'Transition';
			transitions.push({ id, from: fromId, to: toId, label });
			selectedTransitionId = id;
			selectedNodeId = null;
			toast.success('Transition created');
		}
	}

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

	let dragSession: {
		id: string;
		pointerId: number;
		startX: number;
		startY: number;
		originX: number;
		originY: number;
		moved: boolean;
	} | null = null;

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

	function autoLayout() {
		const width = canvasEl?.clientWidth ?? 960;
		const columns = Math.max(1, Math.floor((width - CANVAS_PAD * 2) / COL_STRIDE));
		states.forEach((state, index) => {
			state.x = CANVAS_PAD + (index % columns) * COL_STRIDE;
			state.y = CANVAS_PAD + Math.floor(index / columns) * ROW_STRIDE;
		});
		requestAnimationFrame(measure);
		toast.success('Layout reset');
	}

	function registerState(node: HTMLElement, id: string) {
		stateEls.set(id, node);
		return {
			destroy: () => {
				stateEls.delete(id);
			}
		};
	}

	// --- Drag & drop card -------------------------------------------------------
	function onCardPointerDown(event: PointerEvent, state: WorkflowState): void {
		selectNode(state.id);

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

		const dx = (event.clientX - drag.startX) / zoom;
		const dy = (event.clientY - drag.startY) / zoom;
		if (!drag.moved && Math.hypot(dx, dy) < 4) return;

		drag.moved = true;
		hoveredConnectorId = null;

		const el = stateEls.get(drag.id);
		const maxX = Math.max(0, (canvasEl?.clientWidth ?? 0) * 2 - (el?.offsetWidth ?? CARD_WIDTH));
		const maxY = Math.max(0, (canvasEl?.clientHeight ?? 0) * 2 - (el?.offsetHeight ?? 0));
		state.x = Math.min(Math.max(0, drag.originX + dx), maxX);
		state.y = Math.min(Math.max(0, drag.originY + dy), maxY);
	}

	function endCardDrag(event: PointerEvent): void {
		if (dragSession?.pointerId === event.pointerId) dragSession = null;
	}

	// --- Keyboard shortcuts -----------------------------------------------------
	function onKeyDown(event: KeyboardEvent) {
		if ((event.target as HTMLElement)?.closest('input, select, textarea')) return;

		if (event.key === 'Escape') {
			selectedNodeId = null;
			selectedTransitionId = null;
			return;
		}

		if (event.key === 'Delete' || event.key === 'Backspace') {
			if (selectedNodeId) {
				removeStateWithConfirm(selectedNodeId);
			} else if (selectedTransitionId) {
				removeTransition(selectedTransitionId);
			}
			return;
		}

		if (selectedNodeId && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
			event.preventDefault();
			const state = states.find((s) => s.id === selectedNodeId);
			if (!state) return;
			const step = event.shiftKey ? 20 : 5;
			if (event.key === 'ArrowUp') state.y = Math.max(0, (state.y ?? 0) - step);
			if (event.key === 'ArrowDown') state.y = (state.y ?? 0) + step;
			if (event.key === 'ArrowLeft') state.x = Math.max(0, (state.x ?? 0) - step);
			if (event.key === 'ArrowRight') state.x = (state.x ?? 0) + step;
		}
	}

	// --- Data -------------------------------------------------------------------
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
			// No stored workflow for this collection: clear the selection and fall
			// back to the starter template. Keeping the previous collection's
			// canvas made B render (and save) A's state machine.
			const starter = createStarterWorkflow();
			workflowId = null;
			workflowName = '';
			workflowDescription = '';
			states = starter.states;
			transitions = starter.transitions;
			selectedNodeId = null;
			selectedTransitionId = null;
			ensurePositions();
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
		selectedNodeId = id;
		selectedTransitionId = null;
	}

	function addTransition() {
		if (states.length < 2) {
			toast.error('Add at least two states first');
			return;
		}
		const id = `trans_${generateUUID()}`;
		transitions.push({
			id,
			from: states[0].id,
			to: states[1].id,
			label: 'New Transition'
		});
		selectedTransitionId = id;
		selectedNodeId = null;
	}

	function removeStateWithConfirm(id: string) {
		const targetState = states.find((s) => s.id === id);
		const connectedTransitions = transitions.filter((t) => t.from === id || t.to === id);

		if (connectedTransitions.length > 0) {
			showConfirm({
				title: 'Delete State',
				body: `State <strong>${targetState?.label || id}</strong> has ${connectedTransitions.length} connected transition(s). Deleting it will remove all related paths. Continue?`,
				onConfirm: () => removeState(id)
			});
		} else {
			removeState(id);
		}
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

	/** Point on the quadratic curve at parameter `u` (0 = start, 1 = end). */
	function quadPoint(
		sx: number,
		sy: number,
		cx: number,
		cy: number,
		ex: number,
		ey: number,
		u: number
	) {
		const v = 1 - u;
		return {
			x: v * v * sx + 2 * v * u * cx + u * u * ex,
			y: v * v * sy + 2 * v * u * cy + u * u * ey
		};
	}

	/**
	 * Curve parameter for an edge label. Opposite edges of the same pair (e.g.
	 * "Submit for Review" / "Reject") are bowed apart, but their midpoints sat
	 * only ~57 px from each other while the pills are ~140 px wide, so the text
	 * overlapped. Alternating along the curve guarantees distinct label points.
	 */
	function edgeLabelParam(index: number, reversed: boolean): number {
		if (index === 0 && !reversed) return 0.5;
		const step = 0.14 + 0.05 * Math.floor(index / 2);
		return index % 2 === 0 ? 0.5 - step : 0.5 + step;
	}

	function measure(): void {
		const canvas = canvasEl;
		if (!canvas) return;
		const boxes = new Map<string, { cx: number; cy: number; hw: number; hh: number }>();
		for (const [id, el] of stateEls) {
			const s = states.find((st) => st.id === id);
			const x = s?.x ?? 0;
			const y = s?.y ?? 0;
			const w = el.offsetWidth || CARD_WIDTH;
			const h = el.offsetHeight || 90;
			boxes.set(id, {
				cx: x + w / 2,
				cy: y + h / 2,
				hw: w / 2,
				hh: h / 2
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
			const start = edgePoint(a.cx, a.cy, a.hw, a.hh, dx, dy, 6);
			const end = edgePoint(b.cx, b.cy, b.hw, b.hh, -dx, -dy, 10);

			const mx = (start.x + end.x) / 2;
			const my = (start.y + end.y) / 2;
			let ctrlX = mx;
			let ctrlY = my;
			if (reversed) {
				const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
				const nx = -(end.y - start.y) / len;
				const ny = (end.x - start.x) / len;
				const bow = 48 + index * 18;
				ctrlX = mx + nx * bow;
				ctrlY = my + ny * bow;
			}
			const d = reversed
				? `M ${start.x} ${start.y} Q ${ctrlX} ${ctrlY} ${end.x} ${end.y}`
				: `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
			const labelPoint = quadPoint(
				start.x,
				start.y,
				ctrlX,
				ctrlY,
				end.x,
				end.y,
				edgeLabelParam(index, reversed)
			);

			next.push({
				id: t.id,
				d,
				label: t.label,
				lx: labelPoint.x,
				ly: labelPoint.y,
				selected: selectedTransitionId === t.id
			});
		}
		connectors = next;
	}

	const layoutSignature = $derived(
		`${states.map((s) => `${s.id}:${s.label}:${s.x ?? 0}:${s.y ?? 0}`).join('|')}::${transitions
			.map((t) => `${t.id}:${t.from}>${t.to}:${t.label}`)
			.join('|')}::${selectedNodeId ?? ''}::${selectedTransitionId ?? ''}`
	);

	$effect(() => {
		void layoutSignature;
		const frame = requestAnimationFrame(measure);
		return () => cancelAnimationFrame(frame);
	});

	ensurePositions();

	onMount(() => {
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

<svelte:window onkeydown={onKeyDown} />

<div data-testid="workflows-page" class="contents">
	<AdminPageShell
		title={workflows_title()}
		icon="mdi:sitemap"
		showBackButton={true}
		backUrl="/config"
		description="Visual Lifecycle Management (FSM)"
		fullHeight
		spaceY="4"
	>
		{#snippet actions()}
			<Button
				variant="tertiary"
				onclick={addState}
				data-testid="workflow-add-state"
				class="group whitespace-nowrap"
			>
				<iconify-icon
					icon="mdi:shape-polygon-plus"
					width="18"
					class="transition-transform group-hover:scale-110"
					aria-hidden="true"
				></iconify-icon>
				<span>{workflows_add_state()}</span>
			</Button>
			<Button
				variant="secondary"
				onclick={addTransition}
				data-testid="workflow-add-transition"
				class="group whitespace-nowrap"
			>
				<iconify-icon
					icon="mdi:arrow-decision-outline"
					width="18"
					class="transition-transform group-hover:scale-110"
					aria-hidden="true"
				></iconify-icon>
				<span>{workflows_add_transition()}</span>
			</Button>
			<Button
				variant="tertiary"
				onclick={autoLayout}
				class="group whitespace-nowrap"
				title="Reset positions to a clean grid"
			>
				<iconify-icon
					icon="mdi:view-grid-outline"
					width="18"
					class="transition-transform group-hover:scale-110"
					aria-hidden="true"
				></iconify-icon>
				<span>Auto Layout</span>
			</Button>
			<Button
				variant="primary"
				onclick={saveWorkflow}
				data-testid="workflow-save"
				class="group whitespace-nowrap"
			>
				<iconify-icon
					icon="mdi:content-save"
					width="18"
					class="transition-transform group-hover:scale-110"
					aria-hidden="true"
				></iconify-icon>
				<span>{workflows_save()}</span>
			</Button>
		{/snippet}

		<!-- Toolbar -->
		<AdminCard
			class="grid grid-cols-1 items-start gap-4 border border-surface-500/20 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3 dark:border-surface-500/30 dark:bg-surface-900"
			data-testid="workflow-toolbar"
		>
			<div data-testid="workflow-collection-select">
				<Select
					bind:value={selectedCollectionId}
					options={collectionOptions}
					placeholder={workflows_collection_placeholder()}
					size="md"
					onchange={() => loadWorkflow(selectedCollectionId)}
					class="min-w-48"
				>
					{#snippet labelSnippet()}
						<div class="flex items-center gap-1.5 text-sm font-semibold text-(--admin-text-body)">
							<span>Target Collection</span>
							<Tooltip
								title="The collection whose content lifecycle is controlled by this workflow state machine."
							>
								<HelpIcon ariaLabel="Target collection information" />
							</Tooltip>
						</div>
					{/snippet}
				</Select>
			</div>
			<Input bind:value={workflowName} placeholder={workflows_name_placeholder()} class="min-w-48">
				{#snippet labelSnippet()}
					<div class="flex items-center gap-1.5 text-sm font-semibold text-(--admin-text-body)">
						<span>Workflow Name</span>
						<Tooltip title="Descriptive name for this content review and publishing workflow.">
							<HelpIcon ariaLabel="Workflow name information" />
						</Tooltip>
					</div>
				{/snippet}
			</Input>
			<Input
				bind:value={workflowDescription}
				placeholder={workflows_description_placeholder()}
				class="min-w-48"
			>
				{#snippet labelSnippet()}
					<div class="flex items-center gap-1.5 text-sm font-semibold text-(--admin-text-body)">
						<span>Description</span>
						<Tooltip
							title="Optional summary of this workflow's review stages and approval criteria."
						>
							<HelpIcon ariaLabel="Workflow description information" />
						</Tooltip>
					</div>
				{/snippet}
			</Input>
		</AdminCard>

		<div
			class="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-4"
			data-testid="workflow-builder"
		>
			<!-- Canvas -->
			<div
				class="relative min-h-128 overflow-hidden rounded-xl border border-surface-500/20 bg-surface-500/10 dark:border-surface-500/25 dark:bg-surface-500/10 lg:col-span-3 select-none {isPanning
					? 'cursor-grabbing'
					: 'cursor-default'}"
				bind:this={canvasEl}
				data-testid="workflow-canvas"
				role="region"
				aria-label="Workflow Canvas"
				onpointerdown={onCanvasPointerDown}
				onpointermove={onCanvasPointerMove}
				onpointerup={onCanvasPointerUp}
			>
				<!-- Subtle dot grid -->
				<div
					id="wf-grid-bg"
					class="pointer-events-none absolute inset-0 opacity-[0.45] dark:opacity-[0.35]"
					style="background-image: radial-gradient(circle, currentColor 1px, transparent 1px); background-size: {22 *
						zoom}px {22 *
						zoom}px; background-position: {panX}px {panY}px; color: var(--color-surface-400);"
				></div>

				<!-- Transform layer for zoom and pan -->
				<div
					class="absolute inset-0 origin-top-left transition-transform duration-75"
					style="transform: translate({panX}px, {panY}px) scale({zoom});"
				>
					<!-- Connector overlay -->
					<svg class="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible">
						<defs>
							<marker
								id="wf-arrow"
								viewBox="0 0 10 10"
								refX="9"
								refY="5"
								markerWidth="6"
								markerHeight="6"
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
								markerWidth="6"
								markerHeight="6"
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
								stroke-width={link.selected || hoveredConnectorId === link.id ? 2.5 : 2}
								aria-hidden="true"
								class="transition-colors duration-150 {link.selected ||
								hoveredConnectorId === link.id
									? 'stroke-primary-500'
									: 'stroke-surface-400/80 dark:stroke-surface-500'}"
								marker-end={link.selected || hoveredConnectorId === link.id
									? 'url(#wf-arrow-active)'
									: 'url(#wf-arrow)'}
							/>
						{/each}

						<!-- Live dragging transition wire -->
						{#if portDrag}
							<path
								d={`M ${portDrag.startX} ${portDrag.startY} L ${portDrag.currentX} ${portDrag.currentY}`}
								fill="none"
								stroke-width="2.5"
								stroke-dasharray="4 4"
								class="stroke-primary-500 animate-pulse"
								marker-end="url(#wf-arrow-active)"
							/>
						{/if}

						<!-- Hit areas -->
						{#each connectors as link (link.id)}
							<path
								d={link.d}
								fill="none"
								stroke="transparent"
								stroke-width="20"
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

					<!-- Always-visible transition labels -->
					<div class="pointer-events-none absolute inset-0 z-20">
						{#each connectors as link (link.id)}
							{#if link.label}
								<div
									class="pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm transition-all duration-150
										{link.selected || hoveredConnectorId === link.id
										? 'border-primary-500 bg-primary-500 text-white scale-105 ring-2 ring-primary-500/20'
										: 'border-surface-500/30 bg-white text-surface-900 shadow-xs dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100'}"
									style="left: {link.lx}px; top: {link.ly}px;"
								>
									<span class="max-w-35 truncate">{link.label}</span>
									<button
										type="button"
										class="inline-flex h-4 w-4 items-center justify-center rounded-full opacity-60 transition-opacity hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
										title="Delete transition"
										aria-label="Delete transition {link.label}"
										onclick={(e) => {
											e.stopPropagation();
											removeTransition(link.id);
										}}
									>
										×
									</button>
								</div>
							{/if}
						{/each}
					</div>

					<!-- State cards -->
					{#each states as state (state.id)}
						{@const isSelected = selectedNodeId === state.id}
						<div
							use:registerState={state.id}
							role="button"
							tabindex="0"
							data-testid={`workflow-state-${state.id}`}
							data-wf-state-id={state.id}
							aria-label={`State: ${state.label}`}
							class="group absolute z-10 w-55 cursor-grab touch-none rounded-xl border bg-white shadow-sm transition-all duration-150 active:cursor-grabbing dark:bg-surface-900
								{isSelected
								? 'border-primary-500 shadow-lg ring-4 ring-primary-500/15 scale-[1.015]'
								: 'border-surface-500/30 hover:border-surface-500/30 hover:shadow-md dark:border-surface-500/40 dark:hover:border-surface-600'}"
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
							<!-- Left accent bar -->
							<div
								class="absolute inset-y-0 -inset-s-px w-1.5 rounded-s-xl"
								style="background-color: {state.color}"
							></div>

							<!-- Connection Port (Right handle to drag-create transition) -->
							<button
								type="button"
								class="absolute -inset-e-3.5 top-1/2 -translate-y-1/2 size-7 rounded-full border-2 border-white bg-primary-500 text-white shadow-md flex items-center justify-center cursor-crosshair transition-all duration-200 hover:scale-125 dark:border-surface-500/40 opacity-0 group-hover:opacity-100 group-hover:animate-pulse z-30"
								title="Drag to another state to connect"
								aria-label={`Connect transition from ${state.label}`}
								onpointerdown={(e) => startPortDrag(e, state)}
							>
								<iconify-icon icon="mdi:plus" width="14"></iconify-icon>
							</button>

							<!-- Header -->
							<div class="flex items-start gap-2.5 py-3 ps-4 pe-3">
								<div class="min-w-0 flex-1 pt-0.5">
									<div class="flex flex-wrap items-center gap-1.5">
										<span
											class="truncate text-sm font-semibold text-surface-900 dark:text-surface-50"
										>
											{state.label}
										</span>
										{#if state.isInitial}
											<span
												class="rounded-full bg-primary-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-600 dark:text-primary-400"
											>
												{workflows_initial()}
											</span>
										{/if}
										{#if state.isFinal}
											<span
												class="rounded-full bg-success-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success-600 dark:text-success-400"
											>
												Final
											</span>
										{/if}
									</div>
								</div>

								<div
									class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
								>
									<Tooltip title="Drag to move">
										<span
											class="inline-flex size-7 items-center justify-center rounded-md text-surface-400 hover:bg-surface-500/10 hover:text-surface-600 dark:hover:bg-surface-800"
											aria-hidden="true"
										>
											<iconify-icon icon="mdi:drag-vertical" width="16"></iconify-icon>
										</span>
									</Tooltip>
									<Tooltip title={workflows_delete_state_aria()}>
										<button
											type="button"
											class="inline-flex size-7 items-center justify-center rounded-md text-surface-400 transition-colors hover:bg-error-500/10 hover:text-error-500"
											aria-label={`Delete state ${state.label}`}
											onclick={(e) => {
												e.stopPropagation();
												removeStateWithConfirm(state.id);
											}}
										>
											<iconify-icon icon="mdi:close" width="15" aria-hidden="true"></iconify-icon>
										</button>
									</Tooltip>
								</div>
							</div>

							<!-- Outgoing transitions -->
							<div class="border-t border-surface-100 px-3 py-2.5 dark:border-surface-500/40">
								{#if transitions.some((t) => t.from === state.id)}
									<div class="space-y-1">
										{#each transitions.filter((t) => t.from === state.id) as trans (trans.id)}
											<button
												type="button"
												class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-xs transition-colors
													{selectedTransitionId === trans.id
													? 'bg-primary-500/10 text-primary-600 dark:text-primary-400 font-medium'
													: 'hover:bg-surface-500/10 dark:hover:bg-surface-800/80'}"
												onclick={(event) => {
													event.stopPropagation();
													selectTransition(trans.id);
												}}
											>
												<span class="text-surface-400">→</span>
												<span class="min-w-0 flex-1 truncate font-medium">
													{states.find((s) => s.id === trans.to)?.label ?? trans.to}
												</span>
											</button>
										{/each}
									</div>
								{:else}
									<p class="py-1 text-center text-[10px] text-surface-400/80 dark:text-surface-500">
										No outgoing transitions
									</p>
								{/if}
							</div>
						</div>
					{/each}
				</div>

				<!-- Bottom-Right Canvas Controls: Zoom In / Out / Reset / Pan hint -->
				<div
					class="absolute bottom-3 inset-e-3 z-30 flex items-center gap-1 rounded-lg border border-surface-500/30 bg-white/90 p-1 shadow-md backdrop-blur-sm dark:border-surface-500/40 dark:bg-surface-900/90"
				>
					<Tooltip title="Zoom out">
						<button
							type="button"
							class="size-7 flex items-center justify-center rounded text-surface-600 hover:bg-surface-500/10 dark:text-surface-300 dark:hover:bg-surface-800 transition-colors"
							onclick={zoomOut}
							aria-label="Zoom out"
						>
							<iconify-icon icon="mdi:minus" width="16"></iconify-icon>
						</button>
					</Tooltip>
					<span class="px-1.5 text-xs font-mono font-medium text-surface-500">
						{Math.round(zoom * 100)}%
					</span>
					<Tooltip title="Zoom in">
						<button
							type="button"
							class="size-7 flex items-center justify-center rounded text-surface-600 hover:bg-surface-500/10 dark:text-surface-300 dark:hover:bg-surface-800 transition-colors"
							onclick={zoomIn}
							aria-label="Zoom in"
						>
							<iconify-icon icon="mdi:plus" width="16"></iconify-icon>
						</button>
					</Tooltip>
					<div class="h-4 w-px bg-surface-200 dark:bg-surface-700 mx-0.5"></div>
					<Tooltip title="Reset viewport (100%)">
						<button
							type="button"
							class="size-7 flex items-center justify-center rounded text-surface-600 hover:bg-surface-500/10 dark:text-surface-300 dark:hover:bg-surface-800 transition-colors"
							onclick={resetViewport}
							aria-label="Reset viewport"
						>
							<iconify-icon icon="mdi:fit-to-screen-outline" width="16"></iconify-icon>
						</button>
					</Tooltip>
				</div>
			</div>

			<!-- Properties Inspector -->
			<AdminCard
				class="overflow-y-auto border border-surface-500/20 bg-white p-5 shadow-sm dark:border-surface-500/30 dark:bg-surface-900"
			>
				<div class="mb-5 flex items-center justify-between">
					<h3 class="text-xs font-bold uppercase tracking-widest text-surface-400">
						{workflows_properties()}
					</h3>
				</div>

				{#if selectedNodeId}
					{@const node = states.find((s) => s.id === selectedNodeId)}
					{#if node}
						<div class="space-y-5" in:fade={{ duration: 150 }}>
							<div class="flex items-center gap-2">
								<div
									class="h-3 w-3 rounded-full ring-2 ring-white dark:ring-surface-900"
									style="background-color: {node.color}"
								></div>
								<Badge variant="primary" size="sm">{workflows_state_label()}</Badge>
							</div>

							<Input id="state-name" bind:value={node.label} label="Display Label" />

							<div>
								<label class="mb-1.5 block text-sm font-medium" for="accent-color"
									>Accent Color</label
								>
								<div class="flex items-center gap-3">
									<input
										id="accent-color"
										type="color"
										bind:value={node.color}
										class="h-10 w-14 cursor-pointer rounded-lg border border-surface-500/30 bg-transparent p-1 dark:border-surface-500/40"
									/>
									<span class="font-mono text-xs text-surface-500">{node.color}</span>
								</div>
							</div>

							<div
								class="space-y-3 rounded-lg border border-surface-100 bg-surface-500/50 p-3 dark:border-surface-500/40 dark:bg-surface-900/50"
							>
								<Checkbox
									checked={node.isInitial ?? false}
									label="Initial State"
									size="sm"
									onchange={(checked) => {
										node.isInitial = checked;
										if (checked) {
											states.forEach((s) => {
												if (s.id !== node.id) s.isInitial = false;
											});
										}
									}}
								/>
								<Checkbox
									checked={node.isFinal ?? false}
									label="Final State"
									size="sm"
									onchange={(checked) => {
										node.isFinal = checked;
									}}
								/>
							</div>

							<Button
								variant="error"
								onclick={() => {
									removeStateWithConfirm(node.id);
								}}
								size="sm"
								class="mt-2 w-full"
							>
								{workflows_delete_state()}
							</Button>
						</div>
					{/if}
				{:else if selectedTransitionId}
					{@const trans = transitions.find((t) => t.id === selectedTransitionId)}
					{#if trans}
						<div class="space-y-5" in:fade={{ duration: 150 }}>
							<Badge variant="secondary" size="sm">{workflows_transition_label()}</Badge>

							<Input id="trans-label" bind:value={trans.label} label="Button Label" />

							<div class="grid grid-cols-1 gap-4">
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
							</div>

							<Select
								bind:value={trans.requiredRole}
								label="Required Role (RBAC)"
								size="sm"
								description="User must have this role to trigger this transition."
								options={[
									{ value: '', label: 'No Role (Anyone)' },
									{ value: 'admin', label: 'Administrator' },
									...roleOptions
								]}
							/>

							<Button
								variant="error"
								onclick={() => {
									removeTransition(trans.id);
								}}
								size="sm"
								class="mt-2 w-full"
							>
								{workflows_delete_transition()}
							</Button>
						</div>
					{/if}
				{:else}
					<div class="space-y-6" in:fade={{ duration: 150 }}>
						<div
							class="rounded-xl border border-surface-500/30 bg-surface-500/80 p-4 dark:border-surface-500/40 dark:bg-surface-900/60"
						>
							<p class="mb-3 text-sm font-semibold text-surface-600 dark:text-surface-100">
								{workflowName || 'Untitled workflow'}
							</p>
							<ul class="space-y-1.5 text-xs text-surface-500">
								<li class="flex items-center gap-2">
									<span class="inline-block h-1.5 w-1.5 rounded-full bg-surface-400"></span>
									{states.length}
									{states.length === 1 ? workflows_state_singular() : workflows_state_plural()}
								</li>
								<li class="flex items-center gap-2">
									<span class="inline-block h-1.5 w-1.5 rounded-full bg-surface-400"></span>
									{transitions.length}
									{transitions.length === 1
										? workflows_transition_singular()
										: workflows_transition_plural()}
								</li>
								<li class="flex items-center gap-2">
									<span class="inline-block h-1.5 w-1.5 rounded-full bg-surface-400"></span>
									{selectedCollectionId
										? (collectionOptions.find((o) => o.value === selectedCollectionId)?.label ??
											selectedCollectionId)
										: 'No collection selected'}
								</li>
							</ul>
						</div>

						<div class="flex flex-col items-center justify-center py-8 text-center">
							<div
								class="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-500/10 dark:bg-surface-800"
							>
								<iconify-icon icon="mdi:gesture-tap" width="28" class="text-surface-400"
								></iconify-icon>
							</div>
							<p class="text-sm font-medium text-surface-600 dark:text-surface-400">
								{workflows_inspector_hint()}
							</p>
							<p class="mt-1 max-w-56 text-balance text-xs text-surface-400">
								Click a state or transition arrow to edit its properties
							</p>
						</div>

						<div
							class="border-t border-surface-500/30 dark:border-surface-500/40 pt-4 text-[11px] text-surface-400 space-y-1"
						>
							<p class="font-semibold text-surface-500 uppercase tracking-wider text-[10px]">
								Shortcuts
							</p>
							<p>
								<kbd class="px-1 py-0.5 rounded bg-surface-500/10 dark:bg-surface-800 font-mono"
									>Del</kbd
								> Delete selected
							</p>
							<p>
								<kbd class="px-1 py-0.5 rounded bg-surface-500/10 dark:bg-surface-800 font-mono"
									>Esc</kbd
								> Deselect
							</p>
							<p>
								<kbd class="px-1 py-0.5 rounded bg-surface-500/10 dark:bg-surface-800 font-mono"
									>Arrows</kbd
								> Nudge card
							</p>
							<p>
								<kbd class="px-1 py-0.5 rounded bg-surface-500/10 dark:bg-surface-800 font-mono"
									>Alt + Drag</kbd
								> Pan canvas
							</p>
						</div>
					</div>
				{/if}
			</AdminCard>
		</div>
	</AdminPageShell>
</div>
