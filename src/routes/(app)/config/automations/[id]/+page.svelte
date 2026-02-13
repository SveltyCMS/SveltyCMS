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
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { fade, slide } from 'svelte/transition';
	import PageTitle from '@components/PageTitle.svelte';
	import { showToast } from '@utils/toast';
	import { v4 as uuidv4 } from 'uuid';
	import { AUTOMATION_EVENTS, OPERATION_TYPES } from '@src/services/automation/types';
	import type {
		AutomationFlow,
		AutomationOperation,
		AutomationEvent,
		OperationType,
		WebhookOperationConfig,
		EmailOperationConfig,
		LogOperationConfig,
		SetFieldOperationConfig,
		ConditionOperationConfig
	} from '@src/services/automation/types';

	// ── State ──

	let isNew = $derived(page.params.id === 'new');
	let isLoading = $state(true);
	let isSaving = $state(false);
	let isTesting = $state(false);
	let activeStep = $state(1);
	let testResult: {
		status: string;
		duration: number;
		operationResults: { type: string; status: string; duration: number; error?: string }[];
	} | null = $state(null);

	let flow: AutomationFlow = $state({
		id: '',
		name: '',
		description: '',
		active: true,
		trigger: { type: 'event', events: [], collections: [] },
		operations: [],
		createdAt: '',
		updatedAt: ''
	});

	// ── Lifecycle ──

	onMount(async () => {
		if (!isNew) {
			try {
				const res = await fetch(`/api/automations/${page.params.id}`);
				const result = await res.json();
				if (result.success) {
					flow = result.data;
				} else {
					showToast('Automation not found', 'error');
					goto('/config/automations');
					return;
				}
			} catch (_err) {
				showToast('Failed to load automation', 'error');
				goto('/config/automations');
				return;
			}
		}
		isLoading = false;
	});

	// ── Save & Test ──

	async function save() {
		if (!flow.name.trim()) {
			showToast('Name is required', 'warning');
			activeStep = 1;
			return;
		}

		isSaving = true;
		try {
			const method = isNew ? 'POST' : 'PATCH';
			const url = isNew ? '/api/automations' : `/api/automations/${flow.id}`;

			const res = await fetch(url, {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(flow)
			});
			const result = await res.json();

			if (result.success) {
				showToast(`Automation ${isNew ? 'created' : 'updated'}`, 'success');
				goto('/config/automations');
			} else {
				showToast(result.error || 'Save failed', 'error');
			}
		} catch (_err) {
			showToast('Error saving automation', 'error');
		} finally {
			isSaving = false;
		}
	}

	async function testFlow() {
		if (isNew) {
			showToast('Save the automation first to test it', 'warning');
			return;
		}

		isTesting = true;
		testResult = null;
		try {
			const res = await fetch(`/api/automations/${flow.id}/test`, { method: 'POST' });
			const result = await res.json();
			if (result.success) {
				testResult = result.data;
				showToast(`Test ${result.data.status} in ${result.data.duration}ms`, result.data.status === 'success' ? 'success' : 'warning');
			} else {
				showToast(result.error || 'Test failed', 'error');
			}
		} catch (_err) {
			showToast('Test error', 'error');
		} finally {
			isTesting = false;
		}
	}

	// ── Trigger Helpers ──

	function toggleEvent(event: AutomationEvent) {
		if (!flow.trigger.events) flow.trigger.events = [];
		if (flow.trigger.events.includes(event)) {
			flow.trigger.events = flow.trigger.events.filter((e) => e !== event);
		} else {
			flow.trigger.events = [...flow.trigger.events, event];
		}
	}

	function setTriggerType(type: 'event' | 'schedule' | 'manual') {
		flow.trigger.type = type;
	}

	// ── Operation Helpers ──

	function addOperation(type: OperationType) {
		const defaults: Record<OperationType, () => AutomationOperation> = {
			webhook: () => ({
				id: uuidv4(),
				type: 'webhook',
				config: { url: '', method: 'POST', body: '{{ JSON.stringify(entry) }}' } as WebhookOperationConfig
			}),
			email: () => ({
				id: uuidv4(),
				type: 'email',
				config: {
					to: '',
					subject: 'Notification: {{ entry.title }}',
					body: '<p>Entry <strong>{{ entry.title }}</strong> was {{ trigger.event }}.</p>'
				} as EmailOperationConfig
			}),
			log: () => ({
				id: uuidv4(),
				type: 'log',
				config: { message: '{{ trigger.event }}: {{ entry.title }}', level: 'info' } as LogOperationConfig
			}),
			set_field: () => ({
				id: uuidv4(),
				type: 'set_field',
				config: { field: '', value: '' } as SetFieldOperationConfig
			}),
			condition: () => ({
				id: uuidv4(),
				type: 'condition',
				config: { field: 'status', operator: 'equals', value: 'publish' } as ConditionOperationConfig
			})
		};

		flow.operations = [...flow.operations, defaults[type]()];
	}

	function removeOperation(index: number) {
		flow.operations = flow.operations.filter((_, i) => i !== index);
	}

	function moveOperation(index: number, direction: -1 | 1) {
		const newIndex = index + direction;
		if (newIndex < 0 || newIndex >= flow.operations.length) return;
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
		{ number: 1, label: 'Trigger', icon: 'mdi:flash-outline' },
		{ number: 2, label: 'Operations', icon: 'mdi:cog-outline' },
		{ number: 3, label: 'Preview', icon: 'mdi:eye-outline' }
	];
</script>

<PageTitle name={isNew ? 'New Automation' : `Edit: ${flow.name}`} icon="mdi:robot-outline" showBackButton={true} backUrl="/config/automations" />

{#if isLoading}
	<div class="flex items-center justify-center py-20">
		<iconify-icon icon="mdi:loading" class="text-4xl animate-spin opacity-50"></iconify-icon>
	</div>
{:else}
	<div class="wrapper p-4">
		<!-- Stepper Header -->
		<div class="flex items-center justify-center gap-2 mb-8">
			{#each steps as step (step.number)}
				<button
					class="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200"
					class:bg-primary-500={activeStep === step.number}
					class:text-white={activeStep === step.number}
					class:preset-tonal-surface={activeStep !== step.number}
					class:opacity-50={step.number > activeStep + 1}
					onclick={() => {
						if (step.number <= activeStep + 1) activeStep = step.number;
					}}
					disabled={step.number > activeStep + 1}
				>
					<iconify-icon icon={step.icon}></iconify-icon>
					<span class="hidden sm:inline">{step.label}</span>
					<span class="sm:hidden">{step.number}</span>
				</button>
				{#if step.number < steps.length}
					<iconify-icon icon="mdi:chevron-right" class="text-lg opacity-30"></iconify-icon>
				{/if}
			{/each}
		</div>

		<!-- Step Content -->
		<div class="card bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden">
			<!-- STEP 1: Trigger -->
			{#if activeStep === 1}
				<div class="p-6 space-y-6" transition:fade>
					<div class="space-y-4">
						<h3 class="h3 font-bold flex items-center gap-2">
							<iconify-icon icon="mdi:flash-outline" class="text-primary-500"></iconify-icon>
							Trigger Configuration
						</h3>

						<!-- Name & Description -->
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<label class="label">
								<span class="font-medium">Automation Name <span class="text-error-500">*</span></span>
								<input type="text" class="input" placeholder="e.g. Notify editors on publish" bind:value={flow.name} />
							</label>
							<label class="label">
								<span class="font-medium">Description</span>
								<input type="text" class="input" placeholder="What does this automation do?" bind:value={flow.description} />
							</label>
						</div>

						<hr class="opacity-20" />

						<!-- Trigger Type Selector -->
						<div>
							<span class="block font-medium mb-2">Trigger Type</span>
							<div class="grid grid-cols-3 gap-3">
								{#each [{ type: 'event', label: 'Event Hook', icon: 'mdi:flash-outline', desc: 'When content changes' }, { type: 'schedule', label: 'Schedule', icon: 'mdi:clock-outline', desc: 'At specific times' }, { type: 'manual', label: 'Manual', icon: 'mdi:gesture-tap', desc: 'Triggered by user' }] as triggerOption (triggerOption.type)}
									<button
										class="card p-3 text-center border-2 transition-all duration-200 rounded-lg"
										class:border-primary-500={flow.trigger.type === triggerOption.type}
										class:bg-primary-50={flow.trigger.type === triggerOption.type}
										class:dark:bg-primary-950={flow.trigger.type === triggerOption.type}
										class:border-surface-200={flow.trigger.type !== triggerOption.type}
										class:dark:border-surface-700={flow.trigger.type !== triggerOption.type}
										onclick={() => setTriggerType(triggerOption.type as 'event' | 'schedule' | 'manual')}
									>
										<iconify-icon icon={triggerOption.icon} class="text-2xl mb-1"></iconify-icon>
										<p class="font-medium text-sm">{triggerOption.label}</p>
										<p class="text-[10px] opacity-60">{triggerOption.desc}</p>
									</button>
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
										<label
											class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-surface-200 dark:hover:bg-surface-700 border"
											class:border-primary-400={flow.trigger.events?.includes(eventMeta.event)}
											class:bg-primary-50={flow.trigger.events?.includes(eventMeta.event)}
											class:dark:bg-primary-950={flow.trigger.events?.includes(eventMeta.event)}
											class:border-transparent={!flow.trigger.events?.includes(eventMeta.event)}
										>
											<input
												type="checkbox"
												class="checkbox"
												checked={flow.trigger.events?.includes(eventMeta.event)}
												onchange={() => toggleEvent(eventMeta.event)}
											/>
											<iconify-icon icon={eventMeta.icon} class="text-lg"></iconify-icon>
											<div>
												<span class="text-sm font-medium">{eventMeta.label}</span>
												<span class="badge preset-tonal-surface text-[10px] ml-1">{eventMeta.category}</span>
											</div>
										</label>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Schedule Configuration -->
						{#if flow.trigger.type === 'schedule'}
							<div class="space-y-3" transition:slide>
								<label class="label">
									<span class="font-medium">Cron Expression</span>
									<input type="text" class="input font-mono" placeholder="*/5 * * * *" bind:value={flow.trigger.cron} />
									<p class="text-xs opacity-60 mt-1">
										Examples: <code>0 9 * * 1-5</code> (weekdays at 9am), <code>*/15 * * * *</code> (every 15 min)
									</p>
								</label>
								<label class="label">
									<span class="font-medium">Description</span>
									<input type="text" class="input" placeholder="e.g. Every weekday at 9 AM" bind:value={flow.trigger.cronLabel} />
								</label>
							</div>
						{/if}

						<!-- Manual trigger info -->
						{#if flow.trigger.type === 'manual'}
							<div class="preset-tonal-surface p-4 rounded-lg" transition:slide>
								<div class="flex items-center gap-2 mb-2">
									<iconify-icon icon="mdi:information-outline" class="text-lg text-primary-500"></iconify-icon>
									<span class="font-medium">Manual Trigger</span>
								</div>
								<p class="text-sm opacity-70">
									This automation must be triggered manually via the "Test" button or API endpoint. Useful for one-off tasks or integrations.
								</p>
							</div>
						{/if}

						<!-- Active Toggle -->
						<label class="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors">
							<input type="checkbox" class="checkbox" bind:checked={flow.active} />
							<div>
								<span class="font-medium">Active</span>
								<p class="text-xs opacity-60">Only active automations will be triggered by events.</p>
							</div>
						</label>
					</div>
				</div>
			{/if}

			<!-- STEP 2: Operations -->
			{#if activeStep === 2}
				<div class="p-6 space-y-6" transition:fade>
					<div class="flex items-center justify-between">
						<h3 class="h3 font-bold flex items-center gap-2">
							<iconify-icon icon="mdi:cog-outline" class="text-primary-500"></iconify-icon>
							Operation Chain
						</h3>
					</div>
					<p class="text-sm opacity-60">
						Operations run in order. Use <code class="px-1 py-0.5 bg-surface-200 dark:bg-surface-700 rounded text-xs">{'{{ tokens }}'}</code> in any text
						field for dynamic values.
					</p>

					<!-- Operation List -->
					{#if flow.operations.length > 0}
						<div class="space-y-3">
							{#each flow.operations as op, i (op.id)}
								{@const meta = getOperationMeta(op.type)}
								<div class="card p-4 border border-surface-300 dark:border-surface-600 rounded-lg bg-surface-50 dark:bg-surface-900" transition:slide>
									<!-- Operation Header -->
									<div class="flex items-center justify-between mb-3">
										<div class="flex items-center gap-2">
											<span class="badge preset-tonal-primary text-xs">{i + 1}</span>
											<iconify-icon icon={meta?.icon || 'mdi:cog'} class="text-lg"></iconify-icon>
											<span class="font-bold">{meta?.label || op.type}</span>
										</div>
										<div class="flex items-center gap-1">
											<button class="btn btn-sm variant-ghost-surface" onclick={() => moveOperation(i, -1)} disabled={i === 0} title="Move Up">
												<iconify-icon icon="mdi:chevron-up"></iconify-icon>
											</button>
											<button
												class="btn btn-sm variant-ghost-surface"
												onclick={() => moveOperation(i, 1)}
												disabled={i === flow.operations.length - 1}
												title="Move Down"
											>
												<iconify-icon icon="mdi:chevron-down"></iconify-icon>
											</button>
											<button class="btn btn-sm preset-tonal-error" onclick={() => removeOperation(i)} title="Remove">
												<iconify-icon icon="mdi:close"></iconify-icon>
											</button>
										</div>
									</div>

									<!-- Webhook Config -->
									{#if op.type === 'webhook'}
										{@const cfg = op.config as WebhookOperationConfig}
										<div class="space-y-3">
											<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
												<label class="label md:col-span-2">
													<span class="text-sm">Payload URL</span>
													<input type="url" class="input" placeholder="https://example.com/webhook" bind:value={cfg.url} />
												</label>
												<label class="label">
													<span class="text-sm">Method</span>
													<select class="select" bind:value={cfg.method}>
														<option value="POST">POST</option>
														<option value="PUT">PUT</option>
														<option value="PATCH">PATCH</option>
													</select>
												</label>
											</div>
											<label class="label">
												<span class="text-sm">Body Template <span class="text-xs opacity-50">(supports tokens)</span></span>
												<textarea class="textarea font-mono text-xs" rows="3" placeholder={'{{ JSON.stringify(entry) }}'} bind:value={cfg.body}
												></textarea>
											</label>
											<label class="label">
												<span class="text-sm">Secret (HMAC-SHA256)</span>
												<input type="text" class="input font-mono text-xs" placeholder="Optional signing secret" bind:value={cfg.secret} />
											</label>
										</div>
									{/if}

									<!-- Email Config -->
									{#if op.type === 'email'}
										{@const cfg = op.config as EmailOperationConfig}
										<div class="space-y-3">
											<label class="label">
												<span class="text-sm">To <span class="text-xs opacity-50">(supports tokens)</span></span>
												<input type="text" class="input" placeholder={'editor@example.com or {{ entry.author_email }}'} bind:value={cfg.to} />
											</label>
											<label class="label">
												<span class="text-sm">Subject <span class="text-xs opacity-50">(supports tokens)</span></span>
												<input type="text" class="input" placeholder={'New article published: {{ entry.title }}'} bind:value={cfg.subject} />
											</label>
											<label class="label">
												<span class="text-sm">Body (HTML) <span class="text-xs opacity-50">(supports tokens)</span></span>
												<textarea
													class="textarea text-xs"
													rows="4"
													placeholder={'<p>Entry <strong>{{ entry.title }}</strong> was {{ trigger.event }}.</p>'}
													bind:value={cfg.body}
												></textarea>
											</label>
										</div>
									{/if}

									<!-- Log Config -->
									{#if op.type === 'log'}
										{@const cfg = op.config as LogOperationConfig}
										<div class="space-y-3">
											<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
												<label class="label md:col-span-2">
													<span class="text-sm">Message <span class="text-xs opacity-50">(supports tokens)</span></span>
													<input type="text" class="input" placeholder={'{{ trigger.event }}: {{ entry.title }}'} bind:value={cfg.message} />
												</label>
												<label class="label">
													<span class="text-sm">Level</span>
													<select class="select" bind:value={cfg.level}>
														<option value="info">Info</option>
														<option value="warn">Warning</option>
														<option value="error">Error</option>
													</select>
												</label>
											</div>
										</div>
									{/if}

									<!-- Set Field Config -->
									{#if op.type === 'set_field'}
										{@const cfg = op.config as SetFieldOperationConfig}
										<div class="grid grid-cols-2 gap-3">
											<label class="label">
												<span class="text-sm">Field Name</span>
												<input type="text" class="input" placeholder="status" bind:value={cfg.field} />
											</label>
											<label class="label">
												<span class="text-sm">Value <span class="text-xs opacity-50">(supports tokens)</span></span>
												<input type="text" class="input" placeholder="reviewed" bind:value={cfg.value} />
											</label>
										</div>
									{/if}

									<!-- Condition Config -->
									{#if op.type === 'condition'}
										{@const cfg = op.config as ConditionOperationConfig}
										<div class="grid grid-cols-3 gap-3">
											<label class="label">
												<span class="text-sm">Field</span>
												<input type="text" class="input" placeholder="status" bind:value={cfg.field} />
											</label>
											<label class="label">
												<span class="text-sm">Operator</span>
												<select class="select" bind:value={cfg.operator}>
													<option value="equals">Equals</option>
													<option value="not_equals">Not Equals</option>
													<option value="contains">Contains</option>
													<option value="not_contains">Not Contains</option>
													<option value="exists">Exists</option>
													<option value="not_exists">Not Exists</option>
												</select>
											</label>
											<label class="label">
												<span class="text-sm">Value</span>
												<input type="text" class="input" placeholder="publish" bind:value={cfg.value} />
											</label>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}

					<!-- Add Operation Buttons -->
					<div class="border-2 border-dashed border-surface-300 dark:border-surface-600 rounded-lg p-4">
						<p class="text-sm font-medium mb-3 opacity-70">Add Operation</p>
						<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
							{#each OPERATION_TYPES as opType (opType.type)}
								<button
									class="card p-3 text-center border border-surface-300 dark:border-surface-600 hover:border-primary-500 transition-all duration-200 rounded-lg hover:scale-105"
									onclick={() => addOperation(opType.type)}
								>
									<iconify-icon icon={opType.icon} class="text-xl mb-1"></iconify-icon>
									<p class="text-xs font-medium">{opType.label}</p>
								</button>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<!-- STEP 3: Preview & Test -->
			{#if activeStep === 3}
				<div class="p-6 space-y-6" transition:fade>
					<h3 class="h3 font-bold flex items-center gap-2">
						<iconify-icon icon="mdi:eye-outline" class="text-primary-500"></iconify-icon>
						Preview & Test
					</h3>

					<!-- Flow Summary -->
					<div class="card preset-tonal-surface p-4 rounded-lg space-y-3">
						<div class="flex items-center justify-between">
							<h4 class="font-bold text-lg">{flow.name || 'Untitled'}</h4>
							{#if flow.active}
								<span class="badge preset-filled-success-500 text-xs uppercase">Active</span>
							{:else}
								<span class="badge preset-tonal-surface text-xs uppercase">Paused</span>
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
									{@const meta = AUTOMATION_EVENTS.find((e) => e.event === event)}
									<span class="badge preset-tonal-primary text-xs">
										<iconify-icon icon={meta?.icon || 'mdi:flash'} class="mr-1"></iconify-icon>
										{meta?.label || event}
									</span>
								{/each}
							{:else if flow.trigger.type === 'schedule'}
								<span class="badge preset-tonal-warning text-xs">
									<iconify-icon icon="mdi:clock-outline" class="mr-1"></iconify-icon>
									{flow.trigger.cronLabel || flow.trigger.cron || 'Schedule'}
								</span>
							{:else}
								<span class="badge preset-tonal-surface text-xs">Manual</span>
							{/if}
						</div>

						<!-- Operations Chain -->
						<div class="flex flex-wrap items-center gap-2 text-sm">
							<span class="font-medium">Chain:</span>
							{#each flow.operations as op, i (op.id)}
								{@const meta = getOperationMeta(op.type)}
								<span class="badge preset-tonal-secondary text-xs">
									<iconify-icon icon={meta?.icon || 'mdi:cog'} class="mr-1"></iconify-icon>
									{meta?.label || op.type}
								</span>
								{#if i < flow.operations.length - 1}
									<iconify-icon icon="mdi:arrow-right" class="text-xs opacity-40"></iconify-icon>
								{/if}
							{/each}
							{#if flow.operations.length === 0}
								<span class="text-xs opacity-50 italic">No operations configured</span>
							{/if}
						</div>
					</div>

					<!-- Test Execution -->
					<div class="space-y-3">
						<div class="flex items-center gap-3">
							<button class="btn preset-filled-primary-500" onclick={testFlow} disabled={isTesting || isNew}>
								{#if isTesting}
									<iconify-icon icon="mdi:loading" class="animate-spin"></iconify-icon>
									<span>Testing...</span>
								{:else}
									<iconify-icon icon="mdi:play-outline"></iconify-icon>
									<span>Run Test</span>
								{/if}
							</button>
							{#if isNew}
								<p class="text-xs opacity-50">Save first to enable testing</p>
							{/if}
						</div>

						<!-- Test Results -->
						{#if testResult}
							<div
								class="card p-4 rounded-lg border"
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
									{@const opMeta = OPERATION_TYPES.find((t) => t.type === opResult.type)}
									<div
										class="flex items-center gap-2 text-sm py-1.5"
										class:border-t={i > 0}
										class:border-surface-200={i > 0}
										class:dark:border-surface-700={i > 0}
									>
										<iconify-icon
											icon={opResult.status === 'success' ? 'mdi:check' : opResult.status === 'failure' ? 'mdi:close' : 'mdi:skip-next'}
											class:text-success-600={opResult.status === 'success'}
											class:text-error-600={opResult.status === 'failure'}
											class:text-warning-600={opResult.status === 'skipped'}
										></iconify-icon>
										<iconify-icon icon={opMeta?.icon || 'mdi:cog'} class="opacity-60"></iconify-icon>
										<span>{opMeta?.label || opResult.type}</span>
										<span class="text-xs opacity-50">({opResult.duration}ms)</span>
										{#if opResult.error}
											<span class="text-xs text-error-600">{opResult.error}</span>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>

					<!-- Token Reference -->
					<details class="preset-tonal-surface rounded-lg">
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
		</div>

		<!-- Footer Navigation -->
		<div class="flex items-center justify-between mt-6 p-4 border-t border-surface-200 dark:border-surface-700">
			<div>
				{#if activeStep > 1}
					<button class="btn preset-tonal-surface" onclick={() => (activeStep -= 1)}>
						<iconify-icon icon="mdi:chevron-left"></iconify-icon>
						Back
					</button>
				{:else}
					<button class="btn preset-tonal-surface" onclick={() => goto('/config/automations')}> Cancel </button>
				{/if}
			</div>

			<div class="flex items-center gap-2">
				{#if activeStep < 3}
					<button class="btn preset-filled-primary-500" onclick={() => (activeStep += 1)} disabled={!canProceed}>
						Next
						<iconify-icon icon="mdi:chevron-right"></iconify-icon>
					</button>
				{:else}
					<button class="btn preset-filled-primary-500" onclick={save} disabled={isSaving}>
						{#if isSaving}
							<iconify-icon icon="mdi:loading" class="animate-spin"></iconify-icon>
							Saving...
						{:else}
							<iconify-icon icon="mdi:content-save"></iconify-icon>
							{isNew ? 'Create Automation' : 'Save Changes'}
						{/if}
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.wrapper {
		max-width: 900px;
		margin: 0 auto;
	}
</style>
