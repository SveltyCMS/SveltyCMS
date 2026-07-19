<!--
@files src/routes/(app)/config/automations/[id]/+page.svelte
@component
**Automation Editor — 3-Step Stepper**
Full automation flow editor with trigger picker, operation chain builder,
and preview/test functionality. Reuses TokenPicker patterns.

### Features
- Step 1: Trigger configuration (event hooks, schedule, manual)
- Step 2: Operation chain builder (webhook, email, log, set_field, condition)
- Step 3: Preview & Test with live execution results
-->

<script lang="ts">
import AdminCard from "@components/admin-card.svelte";
import AdminPageShell from "@components/admin-page-shell.svelte";
import StickyActions from "@components/ui/sticky-actions.svelte";
import Checkbox from "@components/ui/checkbox.svelte";
import Input from "@components/ui/input.svelte";
import Loader from "@components/ui/loader.svelte";
import Select from "@components/ui/select.svelte";
import Textarea from "@components/ui/textarea.svelte";
import type {
	AgenticTaskOperationConfig,
	AutomationEvent,
	AutomationFlow,
	AutomationOperation,
	ConditionOperationConfig,
	EmailOperationConfig,
	LogOperationConfig,
	OperationType,
	SetFieldOperationConfig,
	WebhookOperationConfig,
} from "@src/services/background/automation/types";
import {
	AUTOMATION_EVENTS,
	OPERATION_TYPES,
} from "@src/services/background/automation/types";
import { toast } from "@src/stores/toast.svelte.ts";
import { onMount } from "svelte";
import { fade, slide } from "svelte/transition";
import { generateUUID as uuidv4 } from "@utils/native-utils";
import { dndzone } from "svelte-dnd-action";
import { goto } from "$app/navigation";
import { page } from "$app/state";
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
import {
	getAutomation,
	saveAutomation,
	testAutomation,
	unwrapFlow,
} from "../automations-api";

// ── State ──

let isNew = $derived(page.params.id === "new");
let isLoading = $state(true);
let isSaving = $state(false);
let isTesting = $state(false);
let activeStep = $state(1);
let testResult: {
	status: string;
	duration: number;
	operationResults: {
		type: string;
		status: string;
		duration: number;
		error?: string;
	}[];
} | null = $state(null);

let flow: AutomationFlow = $state({
	id: "",
	name: "",
	description: "",
	active: true,
	trigger: { type: "event", events: [], collections: [] },
	operations: [],
	createdAt: "",
	updatedAt: "",
	tenantId: "",
});
// ── Lifecycle ──

onMount(async () => {
	if (!isNew) {
		try {
			const result = await getAutomation(page.params.id);
			const loaded = unwrapFlow(result);
			if (result.success && loaded) {
				flow = loaded;
			} else {
				toast.error("Automation not found");
				goto("/config/automations");
				return;
			}
		} catch (_err) {
			toast.error("Failed to load automation");
			goto("/config/automations");
			return;
		}
	}
	isLoading = false;
});

// ── Save & Test ──

async function save() {
	if (!flow.name.trim()) {
		toast.warning("Name is required");
		activeStep = 1;
		return;
	}

	isSaving = true;
	try {
		const result = await saveAutomation(flow, isNew);

		if (result.success) {
			toast.success(`Automation ${isNew ? "created" : "updated"}`);
			goto("/config/automations");
		} else {
			toast.error(result.error || result.message || "Save failed");
		}
	} catch (_err) {
		toast.error("Error saving automation");
	} finally {
		isSaving = false;
	}
}

async function testFlow() {
	if (isNew) {
		toast.warning("Save the automation first to test it");
		return;
	}

	isTesting = true;
	testResult = null;
	try {
		const result = await testAutomation(flow.id);
		if (result.success) {
			const data = (result as { data?: typeof testResult }).data as typeof testResult;
			testResult = data;
			if (data) {
				toast[data.status === "success" ? "success" : "warning"](
					`Test ${data.status} in ${data.duration}ms`,
				);
			}
		} else {
			toast.error(result.error || result.message || "Test failed");
		}
	} catch (_err) {
		toast.error("Test error");
	} finally {
		isTesting = false;
	}
}

function handleDnd(e: CustomEvent<{ items: AutomationOperation[] }>) {
	flow.operations = e.detail.items;
}

function insertToken(opIndex: number, field: string, token: string) {
	const op = flow.operations[opIndex] as any;
	if (op && op.config) {
		const currentVal = op.config[field] || "";
		op.config[field] = currentVal + token;
		toast.info(`Inserted ${token}`);
	}
}

const availableTokens = [
	{ value: "{{ entry.title }}", label: "Entry Title" },
	{ value: "{{ entry.status }}", label: "Entry Status" },
	{ value: "{{ entry.slug }}", label: "Entry Slug" },
	{ value: "{{ trigger.event }}", label: "Trigger Event" },
	{ value: "{{ trigger.collection }}", label: "Collection Name" },
	{ value: "{{ user.email }}", label: "Actor Email" },
	{ value: "{{ system.now }}", label: "Current Timestamp" },
];

function handleKeydown(e: KeyboardEvent) {
	if ((e.ctrlKey || e.metaKey) && e.key === "s") {
		e.preventDefault();
		save();
	}
	if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && activeStep === 3) {
		e.preventDefault();
		testFlow();
	}
}

// ── Trigger Helpers ──

function toggleEvent(event: AutomationEvent) {
	if (!flow.trigger.events) {
		flow.trigger.events = [];
	}
	if (flow.trigger.events.includes(event)) {
		flow.trigger.events = flow.trigger.events.filter((e) => e !== event);
	} else {
		flow.trigger.events = [...flow.trigger.events, event];
	}
}

function setTriggerType(type: "event" | "schedule" | "manual") {
	flow.trigger.type = type;
}

// ── Operation Helpers ──

function addOperation(type: OperationType) {
	const defaults: Record<OperationType, () => AutomationOperation> = {
		webhook: () => ({
			id: uuidv4(),
			type: "webhook",
			config: {
				url: "",
				method: "POST",
				body: "{{ JSON.stringify(entry) }}",
			} as WebhookOperationConfig,
		}),
		email: () => ({
			id: uuidv4(),
			type: "email",
			config: {
				to: "",
				subject: "Notification: {{ entry.title }}",
				body: "<p>Entry <strong>{{ entry.title }}</strong> was {{ trigger.event }}.</p>",
			} as EmailOperationConfig,
		}),
		log: () => ({
			id: uuidv4(),
			type: "log",
			config: {
				message: "{{ trigger.event }}: {{ entry.title }}",
				level: "info",
			} as LogOperationConfig,
		}),
		set_field: () => ({
			id: uuidv4(),
			type: "set_field",
			config: { field: "", value: "" } as SetFieldOperationConfig,
		}),
		condition: () => ({
			id: uuidv4(),
			type: "condition",
			config: {
				field: "status",
				operator: "equals",
				value: "publish",
			} as ConditionOperationConfig,
		}),
		agentic_task: () => ({
			id: uuidv4(),
			type: "agentic_task",
			config: {
				taskType: "summarize",
				prompt: "Summarize: {{ entry.title }}",
				targetField: "summary",
			} as AgenticTaskOperationConfig,
		}),
	};

	flow.operations = [...flow.operations, defaults[type]()];
}

function removeOperation(index: number) {
	flow.operations = flow.operations.filter((_, i) => i !== index);
}

function moveOperation(index: number, direction: -1 | 1) {
	const newIndex = index + direction;
	if (newIndex < 0 || newIndex >= flow.operations.length) {
		return;
	}
	const ops = [...flow.operations];
	[ops[index], ops[newIndex]] = [ops[newIndex], ops[index]];
	flow.operations = ops;
}

function getOperationMeta(type: OperationType) {
	return OPERATION_TYPES.find((t) => t.type === type);
}

// ── Step validation ──

let canProceed = $derived.by(() => {
	if (activeStep === 1) {
		return flow.name.trim().length > 0;
	}
	if (activeStep === 2) {
		return flow.operations.length > 0;
	}
	return true;
});

const steps = [
	{ number: 1, label: "Trigger", icon: "mdi:flash-outline" },
	{ number: 2, label: "Operations", icon: "mdi:cog-outline" },
	{ number: 3, label: "Preview", icon: "mdi:eye-outline" },
];

const httpMethodOptions = [
	{ value: "POST", label: "POST" },
	{ value: "PUT", label: "PUT" },
	{ value: "PATCH", label: "PATCH" },
];

const logLevelOptions = [
	{ value: "info", label: "Info" },
	{ value: "warn", label: "Warning" },
	{ value: "error", label: "Error" },
];

const conditionOperatorOptions = [
	{ value: "equals", label: "Equals" },
	{ value: "not_equals", label: "Not Equals" },
	{ value: "contains", label: "Contains" },
	{ value: "not_contains", label: "Not Contains" },
	{ value: "exists", label: "Exists" },
	{ value: "not_exists", label: "Not Exists" },
];
</script>

<svelte:window onkeydown={handleKeydown} />

<AdminPageShell
	title={isNew ? 'New Automation' : `Edit: ${flow.name}`}
	icon="mdi:robot-outline"
	showBackButton={true}
	backUrl="/config/automations"
>
{#if isLoading}
	<AdminCard class="flex items-center justify-center border border-surface-200 py-20 dark:border-surface-800" data-testid="automation-editor-loading">
		<Loader variant="circle" width="size-12" height="size-12" ariaLabel="Loading automation" />
	</AdminCard>
{:else}
	<div class="mx-auto max-w-225 space-y-6" data-testid="automation-editor">
		<!-- Stepper Header -->
		<div class="flex flex-col sm:flex-row items-center justify-center gap-2 mb-8" data-testid="automation-stepper">
			{#each steps as step (step.number)}
				<div class="flex items-center gap-2">
					<Button
						variant={activeStep === step.number ? 'tertiary' : 'surface'}
						onclick={() => {
							if (step.number <= activeStep + 1) activeStep = step.number;
						}}
						disabled={step.number > activeStep + 1}
						aria-current={activeStep === step.number ? 'step' : undefined}
						aria-label={step.label}
						data-testid={`automation-step-${step.number}`}
						rounded
						class="w-full sm:w-auto justify-center {step.number > activeStep + 1 ? 'opacity-50' : ''}"
					>
						<iconify-icon icon={step.icon}></iconify-icon>
						<span>{step.label}</span>
					</Button>
					{#if step.number < steps.length}
						<iconify-icon icon="mdi:chevron-right" class="text-lg opacity-30 hidden sm:block"></iconify-icon>
						<iconify-icon icon="mdi:chevron-down" class="text-lg opacity-30 sm:hidden"></iconify-icon>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Step Content -->
		<AdminCard class="overflow-hidden border border-surface-200 bg-white dark:border-surface-800 dark:bg-surface-900/50">
			<!-- STEP 1: Trigger -->
			{#if activeStep === 1}
				<div class="p-6 space-y-6" transition:fade>
					<div class="space-y-4">
						<h3 class="h3 font-bold flex items-center gap-2">
							<iconify-icon icon="mdi:flash-outline" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
							Trigger Configuration
						</h3>

						<!-- Name & Description -->
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<Input
								bind:value={flow.name}
								label="Automation Name *"
								placeholder="e.g. Notify editors on publish"
								aria-label="Automation name"
								data-testid="automation-name"
								required
							/>
							<Input
								bind:value={flow.description}
								label="Description"
								placeholder="What does this automation do?"
								aria-label="Automation description"
								data-testid="automation-description"
							/>
						</div>

						<hr class="opacity-20" />

						<!-- Trigger Type Selector -->
						<div>
							<span class="block font-medium mb-2">Trigger Type</span>
							<div class="grid grid-cols-3 gap-3" data-testid="automation-trigger-types">
								{#each [{ type: 'event', label: 'Event Hook', icon: 'mdi:flash-outline', desc: 'When content changes' }, { type: 'schedule', label: 'Schedule', icon: 'mdi:clock-outline', desc: 'At specific times' }, { type: 'manual', label: 'Manual', icon: 'mdi:gesture-tap', desc: 'Triggered by user' }] as triggerOption (triggerOption.type)}
									{const isSelected = flow.trigger.type === triggerOption.type}
									<Button
										variant="surface"
										class="p-3 text-center border-2 transition-all duration-200 rounded {isSelected ? 'border-tertiary-500 dark:border-primary-500 bg-primary-50 dark:bg-primary-950' : 'border-surface-200 dark:border-surface-700'}"
										onclick={() => setTriggerType(triggerOption.type as 'event' | 'schedule' | 'manual')}
										aria-label="Select {triggerOption.label} trigger"
										data-testid={`automation-trigger-${triggerOption.type}`}
									>
										<iconify-icon icon={triggerOption.icon} class="text-2xl mb-1"></iconify-icon>
										<p class="font-medium text-sm">{triggerOption.label}</p>
										<p class="text-[10px] opacity-60">{triggerOption.desc}</p>
									</Button>
								{/each}
							</div>
						</div>

						<!-- Event Configuration -->
						{#if flow.trigger.type === 'event'}
							<div class="space-y-3" transition:slide>
								<span class="block font-medium">Select Events</span>
								<p class="text-xs opacity-60">Choose which CMS events trigger this automation.</p>
								<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
									{#each AUTOMATION_EVENTS as eventMeta (eventMeta.event)}
										<div
											class="flex items-center gap-3 p-3 rounded transition-colors hover:bg-surface-200 dark:hover:bg-surface-700 border"
											class:border-primary-400={flow.trigger.events?.includes(eventMeta.event)}
											class:bg-primary-50={flow.trigger.events?.includes(eventMeta.event)}
											class:dark:bg-primary-950={flow.trigger.events?.includes(eventMeta.event)}
											class:border-transparent={!flow.trigger.events?.includes(eventMeta.event)}
										>
											<Checkbox
												checked={flow.trigger.events?.includes(eventMeta.event)}
												onchange={() => toggleEvent(eventMeta.event)}
												label={eventMeta.label}
											/>
											<iconify-icon icon={eventMeta.icon} class="text-lg"></iconify-icon>
											<div>
												<span class="text-sm font-medium">{eventMeta.label}</span>
												<Badge preset="tonal" color="surface" size="sm" class="ms-1">{eventMeta.category}</Badge>
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Schedule Configuration -->
						{#if flow.trigger.type === 'schedule'}
							<div class="space-y-3" transition:slide>
								<div>
									<Input
										bind:value={flow.trigger.cron}
										label="Cron Expression"
										placeholder="*/5 * * * *"
										inputClass="font-mono"
										aria-label="Cron expression"
									/>
									<p class="text-xs opacity-60 mt-1">
										Examples: <code>0 9 * * 1-5</code> (weekdays at 9am), <code>*/15 * * * *</code> (every 15 min)
									</p>
								</div>
								<Input
									bind:value={flow.trigger.cronLabel}
									label="Description"
									placeholder="e.g. Every weekday at 9 AM"
									aria-label="Cron description"
								/>
							</div>
						{/if}

						<!-- Manual trigger info -->
						{#if flow.trigger.type === 'manual'}
							<div class="preset-tonal-surface p-4 rounded" transition:slide>
								<div class="flex items-center gap-2 mb-2">
									<iconify-icon icon="mdi:information-outline" class="text-lg text-tertiary-500 dark:text-primary-500"></iconify-icon>
									<span class="font-medium">Manual Trigger</span>
								</div>
								<p class="text-sm opacity-70">
									This automation must be triggered manually via the "Test" button or API endpoint. Useful for one-off tasks or integrations.
								</p>
							</div>
						{/if}

						<!-- Active Toggle -->
						<div class="p-3 rounded hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors">
							<Checkbox
								bind:checked={flow.active}
								label="Active"
								description="Only active automations will be triggered by events."
							/>
						</div>
					</div>
				</div>
			{/if}

			<!-- STEP 2: Operations -->
			{#if activeStep === 2}
				<div class="p-6 space-y-6" transition:fade>
					<div class="flex items-center justify-between">
						<h3 class="h3 font-bold flex items-center gap-2">
							<iconify-icon icon="mdi:cog-outline" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
							Operation Chain
						</h3>
					</div>
					<p class="text-sm opacity-60">
						Operations run in order. Use <code class="px-1 py-0.5 bg-surface-200 dark:bg-surface-700 rounded text-xs">{'{{ tokens }}'}</code> in any text
						field for dynamic values.
					</p>

					<!-- Operation List -->
					{#if flow.operations.length > 0}
						<div
							class="space-y-3"
							use:dndzone={{ items: flow.operations, flipDurationMs: 200, dragDisabled: activeStep !== 2 }}
							onconsider={handleDnd}
							onfinalize={handleDnd}
						>
							{#each flow.operations as op, i (op.id)}
								{const meta = getOperationMeta(op.type)}
								<div
									class="card p-4 border border-surface-300 dark:border-surface-600 rounded bg-surface-50 dark:bg-surface-900 relative"
									transition:slide
								>
									<!-- Drag Handle -->
									<div class="absolute inset-s-1 top-1/2 -translate-y-1/2 opacity-20 hover:opacity-100 cursor-grab active:cursor-grabbing">
										<iconify-icon icon="mdi:drag-vertical" class="text-xl"></iconify-icon>
									</div>

									<!-- Operation Header -->
									<div class="flex items-center justify-between mb-3 ms-4">
										<div class="flex items-center gap-2">
											<Badge preset="tonal" color="primary" size="sm">{i + 1}</Badge>
											<iconify-icon icon={meta?.icon || 'mdi:cog'} class="text-lg"></iconify-icon>
											<span class="font-bold">{meta?.label || op.type}</span>
										</div>
										<div class="flex items-center gap-1">
											<Button variant="ghost" onclick={() => moveOperation(i, -1)} disabled={i === 0} title="Move Up" aria-label="Move operation up" size="sm">
												<iconify-icon icon="mdi:chevron-up"></iconify-icon>
											</Button>
											<Button variant="ghost"
												onclick={() => moveOperation(i, 1)}
												disabled={i === flow.operations.length - 1}
												title="Move Down"
												aria-label="Move operation down"
											 size="sm">
												<iconify-icon icon="mdi:chevron-down"></iconify-icon>
											</Button>
											<Button variant="error" onclick={() => removeOperation(i)} title="Remove" aria-label="Remove operation" size="sm">
												<iconify-icon icon="mdi:close"></iconify-icon>
											</Button>
										</div>
									</div>

									<!-- Webhook Config -->
									{#if op.type === 'webhook'}
										{const cfg = op.config as WebhookOperationConfig}
										<div class="space-y-3">
											<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
												<div class="md:col-span-2">
													<Input
														type="url"
														bind:value={cfg.url}
														label="Payload URL"
														placeholder="https://example.com/webhook"
														aria-label="Webhook URL"
													/>
												</div>
												<Select
													bind:value={cfg.method}
													label="HTTP Method"
													options={httpMethodOptions}
													placeholder="Method"
												/>
											</div>
											<div class="relative">
												<Textarea
													label="Body Template (supports tokens)"
													textareaClass="font-mono text-xs pe-10"
													rows={3}
													placeholder={'{{ JSON.stringify(entry) }}'}
													bind:value={cfg.body}
												/>
												<div class="absolute inset-e-2 bottom-2 flex gap-1">
													<div class="dropdown">
														<Button variant="outline" type="button" title="Insert Token" aria-label="Insert token into body" size="sm" class="p-1 opacity-40 hover:opacity-100">
															<iconify-icon icon="mdi:code-braces"></iconify-icon>
														</Button>
														<div class="dropdown-content card p-2 shadow-xl bg-surface-200 dark:bg-surface-700 z-50 text-[10px] min-w-37.5">
															{#each availableTokens as token (token.value)}
																															<Button variant="ghost" size="sm" class="block w-full text-start p-1 hover:bg-tertiary-500 dark:bg-primary-500 hover:text-white rounded" onclick={() => insertToken(i, 'body', token.value)}>{token.label}</Button>
															{/each}
														</div>
													</div>
												</div>
											</div>
											{#if cfg.url?.startsWith('https')}
												<div transition:slide>
													<Input
														type="password"
														bind:value={cfg.secret}
														label="Secret (HMAC-SHA256)"
														placeholder="Optional signing secret"
														inputClass="font-mono text-xs"
														aria-label="Webhook secret"
													/>
												</div>
											{/if}
										</div>
									{/if}

									<!-- Email Config -->
									{#if op.type === 'email'}
										{const cfg = op.config as EmailOperationConfig}
										<div class="space-y-3">
											<div class="relative">
												<Input
													bind:value={cfg.to}
													label="To (supports tokens)"
													placeholder={'editor@example.com or {{ entry.author_email }}'}
													inputClass="pe-10"
													aria-label="Email recipient"
												/>
												<div class="absolute inset-e-2 bottom-1.5 flex gap-1">
													<div class="dropdown">
														<Button variant="outline" type="button" title="Insert Token" aria-label="Insert token into recipient" size="sm" class="p-1 opacity-40 hover:opacity-100">
															<iconify-icon icon="mdi:code-braces"></iconify-icon>
														</Button>
														<div class="dropdown-content card p-2 shadow-xl bg-surface-200 dark:bg-surface-700 z-50 text-[10px] min-w-37.5">
															{#each availableTokens as token (token.value)}
																															<Button variant="ghost" size="sm" class="block w-full text-start p-1 hover:bg-tertiary-500 dark:bg-primary-500 hover:text-white rounded" onclick={() => insertToken(i, 'to', token.value)}>{token.label}</Button>
															{/each}
														</div>
													</div>
												</div>
											</div>
											<div class="relative">
												<Input
													bind:value={cfg.subject}
													label="Subject (supports tokens)"
													placeholder={'New article published: {{ entry.title }}'}
													inputClass="pe-10"
													aria-label="Email subject"
												/>
												<div class="absolute inset-e-2 bottom-1.5 flex gap-1">
													<div class="dropdown">
														<Button variant="outline" type="button" title="Insert Token" aria-label="Insert token into subject" size="sm" class="p-1 opacity-40 hover:opacity-100">
															<iconify-icon icon="mdi:code-braces"></iconify-icon>
														</Button>
														<div class="dropdown-content card p-2 shadow-xl bg-surface-200 dark:bg-surface-700 z-50 text-[10px] min-w-37.5">
															{#each availableTokens as token (token.value)}
																															<Button variant="ghost" size="sm" class="block w-full text-start p-1 hover:bg-tertiary-500 dark:bg-primary-500 hover:text-white rounded" onclick={() => insertToken(i, 'subject', token.value)} aria-label="Insert token {token.label}">{token.label}</Button>
															{/each}
														</div>
													</div>
												</div>
											</div>
											<div class="relative">
												<Textarea
													label="Body (HTML) (supports tokens)"
													textareaClass="text-xs pe-10"
													rows={4}
													placeholder={'<p>Entry <strong>{{ entry.title }}</strong> was {{ trigger.event }}.</p>'}
													bind:value={cfg.body}
												/>
												<div class="absolute inset-e-2 bottom-2 flex gap-1">
													<div class="dropdown">
														<Button variant="outline" type="button" title="Insert Token" aria-label="Insert token into email body" size="sm" class="p-1 opacity-40 hover:opacity-100">
															<iconify-icon icon="mdi:code-braces"></iconify-icon>
														</Button>
														<div class="dropdown-content card p-2 shadow-xl bg-surface-200 dark:bg-surface-700 z-50 text-[10px] min-w-37.5">
															{#each availableTokens as token (token.value)}
																															<Button variant="ghost" size="sm" class="block w-full text-start p-1 hover:bg-tertiary-500 dark:bg-primary-500 hover:text-white rounded" onclick={() => insertToken(i, 'body', token.value)} aria-label="Insert body token {token.label}">{token.label}</Button>
															{/each}
													</div>
												</div>
											</div>
									</div>
								</div>
							{/if}

							<!-- Log Config -->
									{#if op.type === 'log'}
										{const cfg = op.config as LogOperationConfig}
										<div class="space-y-3">
											<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
												<div class="relative md:col-span-2">
													<Input
														bind:value={cfg.message}
														label="Message (supports tokens)"
														placeholder={'{{ trigger.event }}: {{ entry.title }}'}
														inputClass="pe-10"
														aria-label="Log message"
													/>
													<div class="absolute inset-e-2 bottom-1.5 flex gap-1">
														<div class="dropdown">
															<Button variant="outline" type="button" title="Insert Token" aria-label="Insert token into message" size="sm" class="p-1 opacity-40 hover:opacity-100">
																<iconify-icon icon="mdi:code-braces"></iconify-icon>
															</Button>
															<div class="dropdown-content card p-2 shadow-xl bg-surface-200 dark:bg-surface-700 z-50 text-[10px] min-w-37.5">
																{#each availableTokens as token (token.value)}
																																	<Button variant="ghost" size="sm" class="block w-full text-start p-1 hover:bg-tertiary-500 dark:bg-primary-500 hover:text-white rounded" onclick={() => insertToken(i, 'message', token.value)}>{token.label}</Button>
																{/each}
															</div>
														</div>
													</div>
												</div>
												<Select
													bind:value={cfg.level}
													label="Log Level"
													options={logLevelOptions}
													placeholder="Level"
												/>
											</div>
										</div>
									{/if}

									<!-- Set Field Config -->
									{#if op.type === 'set_field'}
										{const cfg = op.config as SetFieldOperationConfig}
										<div class="grid grid-cols-2 gap-3">
											<Input
												bind:value={cfg.field}
												label="Field Name"
												placeholder="status"
												aria-label="Set field name"
											/>
											<div class="relative">
												<Input
													bind:value={cfg.value}
													label="Value (supports tokens)"
													placeholder="reviewed"
													inputClass="pe-10"
													aria-label="Set field value"
												/>
												<div class="absolute inset-e-2 bottom-1.5 flex gap-1">
													<div class="dropdown">
														<Button variant="outline" type="button" title="Insert Token" size="sm" class="p-1 opacity-40 hover:opacity-100">
															<iconify-icon icon="mdi:code-braces"></iconify-icon>
														</Button>
														<div class="dropdown-content card p-2 shadow-xl bg-surface-200 dark:bg-surface-700 z-50 text-[10px] min-w-37.5">
															{#each availableTokens as token (token.value)}
																																<Button variant="ghost" size="sm" class="block w-full text-start p-1 hover:bg-tertiary-500 dark:bg-primary-500 hover:text-white rounded" onclick={() => insertToken(i, 'value', token.value)} aria-label="Insert value token {token.label}">{token.label}</Button>
															{/each}
														</div>
													</div>
												</div>
											</div>
										</div>
									{/if}

									<!-- Condition Config -->
									{#if op.type === 'condition'}
										{const cfg = op.config as ConditionOperationConfig}
										<div class="grid grid-cols-3 gap-3">
											<Input
												bind:value={cfg.field}
												label="Field"
												placeholder="status"
												aria-label="Condition field"
											/>
											<Select
												bind:value={cfg.operator}
												label="Operator"
												options={conditionOperatorOptions}
												placeholder="Operator"
											/>
											<Input
												bind:value={cfg.value}
												label="Value"
												placeholder="publish"
												aria-label="Condition value"
											/>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}

					<!-- Add Operation Buttons -->
					<div class="border-2 border-dashed border-surface-300 dark:border-surface-600 rounded p-4" data-testid="automation-add-ops">
						<p class="text-sm font-medium mb-3 opacity-70">Add Operation</p>
						<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
							{#each OPERATION_TYPES as opType (opType.type)}
								<Button
									variant="surface"
									class="p-3 text-center border border-surface-300 hover:border-tertiary-500 dark:border-primary-500 transition-all duration-200 rounded hover:scale-105"
									onclick={() => addOperation(opType.type)}
									aria-label="Add {opType.label} operation"
									data-testid={`automation-add-op-${opType.type}`}
								>
									<iconify-icon icon={opType.icon} class="text-xl mb-1"></iconify-icon>
									<p class="text-xs font-medium">{opType.label}</p>
								</Button>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<!-- STEP 3: Preview & Test -->
			{#if activeStep === 3}
				<div class="p-6 space-y-6" transition:fade>
					<h3 class="h3 font-bold flex items-center gap-2">
						<iconify-icon icon="mdi:eye-outline" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						Preview & Test
					</h3>

					<!-- Flow Summary -->
					<AdminCard class="preset-tonal-surface p-4 rounded space-y-3">
						<div class="flex items-center justify-between">
							<h4 class="font-bold text-lg">{flow.name || 'Untitled'}</h4>
							{#if flow.active}
								<Badge variant="success" size="sm" class="uppercase">Active</Badge>
							{:else}
								<Badge preset="tonal" color="surface" size="sm" class="uppercase">Paused</Badge>
							{/if}
						</div>

						{#if flow.description}
							<p class="text-sm opacity-70">{flow.description}</p>
						{/if}

						<!-- Trigger Info -->
						<div class="flex items-center gap-2 text-sm">
							<span class="font-medium">Trigger:</span>
							{#if flow.trigger.type === 'event'}
								{#each flow.trigger.events || [] as event (event)}
									{const meta = AUTOMATION_EVENTS.find((e) => e.event === event)}
									<Badge preset="tonal" color="primary" size="sm">
										<iconify-icon icon={meta?.icon || 'mdi:flash'} class="me-1"></iconify-icon>
										{meta?.label || event}
									</Badge>
								{/each}
							{:else if flow.trigger.type === 'schedule'}
								<Badge preset="tonal" color="warning" size="sm">
									<iconify-icon icon="mdi:clock-outline" class="me-1"></iconify-icon>
									{flow.trigger.cronLabel || flow.trigger.cron || 'Schedule'}
								</Badge>
							{:else}
								<Badge preset="tonal" color="surface" size="sm">Manual</Badge>
							{/if}
						</div>

						<!-- Operations Chain -->
						<div class="flex flex-wrap items-center gap-2 text-sm">
							<span class="font-medium">Chain:</span>
							{#each flow.operations as op, i (op.id)}
								{const meta = getOperationMeta(op.type)}
								<Badge preset="tonal" color="secondary" size="sm">
									<iconify-icon icon={meta?.icon || 'mdi:cog'} class="me-1"></iconify-icon>
									{meta?.label || op.type}
								</Badge>
								{#if i < flow.operations.length - 1}
									<iconify-icon icon="mdi:arrow-right" class="text-xs opacity-40"></iconify-icon>
								{/if}
							{/each}
							{#if flow.operations.length === 0}
								<span class="text-xs opacity-50 italic">No operations configured</span>
							{/if}
						</div>
					</AdminCard>

					<!-- Test Execution -->
					<div class="space-y-3">
						<div class="flex items-center gap-3">
							<Button variant="tertiary" onclick={testFlow} disabled={isTesting || isNew} aria-label="Run test" class="dark:">
								{#if isTesting}
									<iconify-icon icon="mdi:loading" class="animate-spin"></iconify-icon>
									<span>Testing...</span>
								{:else}
									<iconify-icon icon="mdi:play-outline"></iconify-icon>
									<span>Run Test</span>
									<span class="text-[10px] opacity-60 ms-1 hidden sm:inline">(Ctrl+Enter)</span>
								{/if}
							</Button>
							{#if isNew}
								<p class="text-xs opacity-50">Save first to enable testing</p>
							{/if}
						</div>

						<!-- Test Results -->
						{#if testResult}
							<div
								class="card p-4 rounded border"
								class:border-success-400={testResult.status === 'success'}
								class:bg-success-50={testResult.status === 'success'}
								class:dark:bg-success-950={testResult.status === 'success'}
								class:border-error-400={testResult.status === 'failure'}
								class:bg-error-50={testResult.status === 'failure'}
								class:dark:bg-error-950={testResult.status === 'failure'}
								class:border-warning-400={testResult.status === 'skipped'}
								class:bg-warning-50={testResult.status === 'skipped'}
								class:dark:bg-warning-950={testResult.status === 'skipped'}
								transition:slide
							>
								<div class="flex items-center gap-2 mb-3">
									<iconify-icon
										icon={testResult.status === 'success'
											? 'mdi:check-circle'
											: testResult.status === 'failure'
												? 'mdi:close-circle'
												: 'mdi:skip-next-circle'}
										class="text-xl"
										class:text-success-600={testResult.status === 'success'}
										class:text-error-600={testResult.status === 'failure'}
										class:text-warning-600={testResult.status === 'skipped'}
									></iconify-icon>
									<span class="font-bold uppercase text-sm">{testResult.status}</span>
									<span class="text-xs opacity-60">({testResult.duration}ms)</span>
								</div>

								{#each testResult.operationResults as opResult, i (i)}
									{const opMeta = OPERATION_TYPES.find((t) => t.type === opResult.type)}
									<div class="py-2 border-t border-surface-200 dark:border-surface-700">
										<div class="flex items-center gap-2 text-sm mb-1">
											<iconify-icon
												icon={opResult.status === 'success' ? 'mdi:check' : opResult.status === 'failure' ? 'mdi:close' : 'mdi:skip-next'}
												class:text-success-600={opResult.status === 'success'}
												class:text-error-600={opResult.status === 'failure'}
												class:text-warning-600={opResult.status === 'skipped'}
											></iconify-icon>
											<iconify-icon icon={opMeta?.icon || 'mdi:cog'} class="opacity-60"></iconify-icon>
											<span class="font-medium">{opMeta?.label || opResult.type}</span>
											<span class="text-xs opacity-50 ml-auto">{opResult.duration}ms</span>
										</div>
										{#if opResult.error}
											<div class="text-xs text-error-600 mb-1">{opResult.error}</div>
										{/if}

										<details class="text-[10px] opacity-60">
											<summary class="cursor-pointer hover:opacity-100">Show Details</summary>
											<pre class="bg-surface-900 text-surface-100 p-2 rounded mt-1 overflow-auto max-h-32">{JSON.stringify(opResult, null, 2)}</pre>
										</details>
									</div>
								{/each}
							</div>
						{/if}
					</div>

					<style>
						.dropdown {
							position: relative;
							display: inline-block;
						}
						.dropdown-content {
							display: none;
							position: absolute;
							right: 0;
							bottom: 100%;
							min-width: 160px;
							z-index: 100;
						}
						.dropdown:hover .dropdown-content {
							display: block;
						}
					</style>

					<!-- Token Reference -->
					<details class="preset-tonal-surface rounded">
						<summary class="p-3 cursor-pointer font-medium text-sm flex items-center gap-2">
							<iconify-icon icon="mdi:code-braces"></iconify-icon>
							Available Tokens Reference
						</summary>
						<div class="px-3 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
							<div>
								<p class="font-bold mb-1">Entry Tokens</p>
								<code class="block opacity-70">{'{{ entry.title }}'}</code>
								<code class="block opacity-70">{'{{ entry.status }}'}</code>
								<code class="block opacity-70">{'{{ entry.author }}'}</code>
								<code class="block opacity-70">{'{{ entry.<field_name> }}'}</code>
							</div>
							<div>
								<p class="font-bold mb-1">Trigger Tokens</p>
								<code class="block opacity-70">{'{{ trigger.event }}'}</code>
								<code class="block opacity-70">{'{{ trigger.collection }}'}</code>
								<code class="block opacity-70">{'{{ trigger.timestamp }}'}</code>
								<code class="block opacity-70">{'{{ trigger.previous.<field> }}'}</code>
							</div>
							<div>
								<p class="font-bold mb-1">User Tokens</p>
								<code class="block opacity-70">{'{{ user.email }}'}</code>
								<code class="block opacity-70">{'{{ user.username }}'}</code>
							</div>
							<div>
								<p class="font-bold mb-1">System Tokens</p>
								<code class="block opacity-70">{'{{ system.now }}'}</code>
							</div>
						</div>
					</details>
				</div>
			{/if}
		</AdminCard>

		<!-- Footer Navigation -->
		<div class="flex items-center justify-between mt-6 p-4 border-t border-surface-200 dark:border-surface-700" data-testid="automation-footer">
			<div>
				{#if activeStep > 1}
					<Button variant="surface" onclick={() => (activeStep -= 1)} aria-label="Go back" data-testid="automation-back">
						<iconify-icon icon="mdi:chevron-left"></iconify-icon>
						Back
					</Button>
				{:else}
					<Button variant="surface" onclick={() => goto('/config/automations')} aria-label="Cancel and go back" data-testid="automation-cancel">Cancel</Button>
				{/if}
			</div>

			<div class="flex items-center gap-2">
				{#if activeStep < 3}
					<Button variant="tertiary" onclick={() => (activeStep += 1)} disabled={!canProceed} aria-label="Go to next step" data-testid="automation-next">
						Next
						<iconify-icon icon="mdi:chevron-right"></iconify-icon>
					</Button>
				{:else}
					<StickyActions>
					<Button variant="tertiary" onclick={save} disabled={isSaving} aria-label="Save automation" data-testid="automation-save">
						{#if isSaving}
							<iconify-icon icon="mdi:loading" class="animate-spin"></iconify-icon>
							Saving...
						{:else}
							<iconify-icon icon="mdi:content-save"></iconify-icon>
							{isNew ? 'Create Automation' : 'Save Changes'}
							<span class="text-[10px] opacity-60 ms-1 hidden sm:inline">(Ctrl+S)</span>
						{/if}
					</Button>
					</StickyActions>
				{/if}
			</div>
		</div>
	</div>
{/if}
</AdminPageShell>
