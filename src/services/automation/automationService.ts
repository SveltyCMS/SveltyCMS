/**
 * @file src/services/automation/automationService.ts
 * @description Core automation engine for SveltyCMS.
 * Manages automation flows (CRUD), executes operation chains,
 * and integrates with the EventBus and existing WebhookService.
 *
 * Features:
 * - Flow CRUD via systemPreferences (DB-agnostic)
 * - Operation executors: webhook, email, log, set_field, condition
 * - Token-aware payload resolution via replaceTokens()
 * - Execution logging with per-operation results
 * - Non-blocking async execution
 */

import { logger } from '@utils/logger.server';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from './eventBus';
import type {
	AutomationEventPayload,
	AutomationFlow,
	AutomationOperation,
	ConditionOperationConfig,
	EmailOperationConfig,
	ExecutionLogEntry,
	ExecutionStatus,
	LogOperationConfig,
	SetFieldOperationConfig,
	WebhookOperationConfig
} from './types';

const getDbAdapter = async () => (await import('@src/databases/db')).dbAdapter;

/**
 * Singleton automation service.
 * Registers itself as a listener on the EventBus and manages flow persistence.
 */
class AutomationService {
	private static instance: AutomationService;
	private flowsCache: AutomationFlow[] | null = null;
	private cacheTimestamp = 0;
	private readonly CACHE_TTL = 60 * 1000; // 1 minute
	private initialized = false;

	/** Recent execution logs (in-memory ring buffer, max 100) */
	private executionLogs: ExecutionLogEntry[] = [];
	private readonly MAX_LOGS = 100;

	private constructor() {}

	public static getInstance(): AutomationService {
		if (!AutomationService.instance) {
			AutomationService.instance = new AutomationService();
		}
		return AutomationService.instance;
	}

	/**
	 * Initialize the service: register wildcard listener on EventBus.
	 * Safe to call multiple times (idempotent).
	 */
	public init(): void {
		if (this.initialized) {
			return;
		}
		this.initialized = true;

		eventBus.on('*', async (payload) => {
			await this.handleEvent(payload);
		});

		logger.info('⚡ AutomationService initialized — listening for events');
	}

	// ── Flow CRUD ──────────────────────────────────────────────

	/** Get all automation flows */
	public async getFlows(): Promise<AutomationFlow[]> {
		if (this.flowsCache && Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
			return this.flowsCache;
		}

		try {
			const db = await getDbAdapter();
			if (!db) {
				return [];
			}

			const result = await db.systemPreferences.get<AutomationFlow[]>('automations_config', 'system');
			this.flowsCache = result.success && Array.isArray(result.data) ? result.data : [];
			this.cacheTimestamp = Date.now();
			return this.flowsCache;
		} catch (e) {
			logger.error('Failed to load automation flows:', e);
			return [];
		}
	}

	/** Get a single flow by ID */
	public async getFlow(id: string): Promise<AutomationFlow | null> {
		const flows = await this.getFlows();
		return flows.find((f) => f.id === id) ?? null;
	}

	/** Create or update a flow */
	public async saveFlow(flow: Partial<AutomationFlow>): Promise<AutomationFlow> {
		const db = await getDbAdapter();
		if (!db) {
			throw new Error('Database not available');
		}

		const current = await this.getFlows();
		const now = new Date().toISOString();

		const savedFlow: AutomationFlow = {
			id: flow.id || uuidv4(),
			name: flow.name || 'Untitled Automation',
			description: flow.description || '',
			active: flow.active ?? true,
			trigger: flow.trigger || { type: 'event', events: [] },
			operations: flow.operations || [],
			lastTriggered: flow.lastTriggered,
			triggerCount: flow.triggerCount ?? 0,
			failureCount: flow.failureCount ?? 0,
			createdAt: flow.createdAt || now,
			updatedAt: now
		};

		let updated: AutomationFlow[];
		if (flow.id) {
			updated = current.map((f) => (f.id === flow.id ? savedFlow : f));
		} else {
			updated = [...current, savedFlow];
		}

		await db.systemPreferences.set('automations_config', updated, 'system');
		this.flowsCache = updated;
		this.cacheTimestamp = Date.now();

		return savedFlow;
	}

	/** Delete a flow by ID */
	public async deleteFlow(id: string): Promise<void> {
		const db = await getDbAdapter();
		if (!db) {
			return;
		}

		const current = await this.getFlows();
		const updated = current.filter((f) => f.id !== id);

		await db.systemPreferences.set('automations_config', updated, 'system');
		this.flowsCache = updated;
		this.cacheTimestamp = Date.now();
	}

	/** Duplicate a flow */
	public async duplicateFlow(id: string): Promise<AutomationFlow> {
		const flow = await this.getFlow(id);
		if (!flow) {
			throw new Error('Flow not found');
		}

		return this.saveFlow({
			...flow,
			id: undefined,
			name: `${flow.name} (Copy)`,
			active: false,
			triggerCount: 0,
			failureCount: 0
		});
	}

	// ── Event Handling ─────────────────────────────────────────

	/** Handle an incoming event: find matching flows and execute */
	private async handleEvent(payload: AutomationEventPayload): Promise<void> {
		const flows = await this.getFlows();
		const matchingFlows = flows.filter((flow) => {
			if (!flow.active) {
				return false;
			}
			if (flow.trigger.type !== 'event') {
				return false;
			}
			if (!flow.trigger.events?.includes(payload.event)) {
				return false;
			}

			// Collection filter: if specified, entry must match
			if (
				flow.trigger.collections &&
				flow.trigger.collections.length > 0 &&
				payload.collection &&
				!flow.trigger.collections.includes(payload.collection)
			) {
				return false;
			}

			return true;
		});

		if (matchingFlows.length === 0) {
			return;
		}

		logger.debug(`AutomationService: ${payload.event} matched ${matchingFlows.length} flows`);

		// Execute matching flows in parallel (non-blocking)
		for (const flow of matchingFlows) {
			this.executeFlow(flow, payload).catch((err) => logger.error(`Automation flow "${flow.name}" execution error:`, err));
		}
	}

	/** Execute a flow's operation chain */
	public async executeFlow(flow: AutomationFlow, payload: AutomationEventPayload): Promise<ExecutionLogEntry> {
		const startTime = Date.now();
		const logEntry: ExecutionLogEntry = {
			id: uuidv4(),
			automationId: flow.id,
			automationName: flow.name,
			event: payload.event,
			status: 'success',
			operationResults: [],
			duration: 0,
			timestamp: new Date().toISOString(),
			triggerPayload: payload
		};

		for (const operation of flow.operations) {
			const opStart = Date.now();
			try {
				const result = await this.executeOperation(operation, payload);

				logEntry.operationResults.push({
					operationId: operation.id,
					type: operation.type,
					status: result ? 'success' : 'skipped',
					duration: Date.now() - opStart
				});

				// If condition returned false, stop chain
				if (result === false) {
					logEntry.status = 'skipped';
					break;
				}
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				logEntry.operationResults.push({
					operationId: operation.id,
					type: operation.type,
					status: 'failure',
					duration: Date.now() - opStart,
					error: errorMsg
				});

				logEntry.status = 'failure';
				if (operation.stopOnError !== false) {
					break; // Default: stop chain on error
				}
			}
		}

		logEntry.duration = Date.now() - startTime;

		// Update flow stats (fire-and-forget)
		this.updateFlowStats(flow.id, logEntry.status).catch(() => {});

		// Store log entry
		this.addLogEntry(logEntry);

		return logEntry;
	}

	// ── Operation Executors ────────────────────────────────────

	/**
	 * Execute a single operation.
	 * Returns true for success, false for condition-not-met (skip rest).
	 */
	private async executeOperation(operation: AutomationOperation, payload: AutomationEventPayload): Promise<boolean> {
		const resolvedConfig = await this.resolveTokensInConfig(operation.config as unknown as Record<string, unknown>, payload);

		switch (operation.type) {
			case 'webhook':
				await this.executeWebhook(resolvedConfig as unknown as WebhookOperationConfig, payload);
				return true;

			case 'email':
				await this.executeEmail(resolvedConfig as unknown as EmailOperationConfig, payload);
				return true;

			case 'log':
				this.executeLog(resolvedConfig as unknown as LogOperationConfig);
				return true;

			case 'set_field':
				await this.executeSetField(resolvedConfig as unknown as SetFieldOperationConfig, payload);
				return true;

			case 'condition':
				return this.evaluateCondition(resolvedConfig as unknown as ConditionOperationConfig, payload);

			default:
				logger.warn(`Unknown operation type: ${operation.type}`);
				return true;
		}
	}

	/** Execute a webhook operation */
	private async executeWebhook(config: WebhookOperationConfig, payload: AutomationEventPayload): Promise<void> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10_000); // 10s timeout

		const body = config.body || JSON.stringify(payload);
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'User-Agent': 'SveltyCMS-Automation/1.0',
			'X-SveltyCMS-Event': payload.event,
			...(config.headers || {})
		};

		// HMAC signature if secret provided
		if (config.secret) {
			const crypto = await import('node:crypto');
			const signature = crypto.createHmac('sha256', config.secret).update(body).digest('hex');
			headers['X-SveltyCMS-Signature'] = `sha256=${signature}`;
		}

		try {
			const response = await fetch(config.url, {
				method: config.method || 'POST',
				headers,
				body,
				signal: controller.signal
			});
			clearTimeout(timeoutId);

			if (!response.ok) {
				throw new Error(`Webhook returned HTTP ${response.status}`);
			}

			logger.debug(`Automation webhook sent to ${config.url}`);
		} catch (err) {
			clearTimeout(timeoutId);
			throw err;
		}
	}

	/** Execute an email operation */
	private async executeEmail(config: EmailOperationConfig, _payload: AutomationEventPayload): Promise<void> {
		// Use the core email server utility
		try {
			const { sendMail } = await import('@src/utils/email.server');
			await sendMail({
				recipientEmail: config.to,
				subject: config.subject,
				templateName: 'customEmail', // Using a generic template if needed, or we might need to adjust how custom bodies are handled
				props: {
					body: config.body
				}
			});
			logger.info(`Automation email sent to ${config.to}: "${config.subject}"`);
		} catch (err) {
			logger.error('Automation email failed:', err);
			throw err;
		}
	}

	/** Execute a log operation */
	private executeLog(config: LogOperationConfig): void {
		const level = config.level || 'info';
		logger[level](`[Automation] ${config.message}`);
	}

	/** Execute a set_field operation */
	private async executeSetField(config: SetFieldOperationConfig, payload: AutomationEventPayload): Promise<void> {
		if (!(payload.entryId && payload.collection)) {
			logger.warn('set_field: No entry context available');
			return;
		}

		const db = await getDbAdapter();
		if (!db) {
			throw new Error('Database not available');
		}

		// Update the field on the entry
		await db.crud.update(payload.collection, payload.entryId as any, {
			[config.field]: config.value
		});

		logger.debug(`Automation set_field: ${config.field} = ${config.value} on ${payload.entryId}`);
	}

	/** Evaluate a condition operation */
	private evaluateCondition(config: ConditionOperationConfig, payload: AutomationEventPayload): boolean {
		const fieldValue = payload.data?.[config.field];

		switch (config.operator) {
			case 'equals':
				return String(fieldValue) === config.value;
			case 'not_equals':
				return String(fieldValue) !== config.value;
			case 'contains':
				return String(fieldValue ?? '').includes(config.value ?? '');
			case 'not_contains':
				return !String(fieldValue ?? '').includes(config.value ?? '');
			case 'exists':
				return fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
			case 'not_exists':
				return fieldValue === undefined || fieldValue === null || fieldValue === '';
			default:
				return true;
		}
	}

	// ── Token Resolution ───────────────────────────────────────

	/** Resolve {{ tokens }} in operation config values */
	private async resolveTokensInConfig(config: Record<string, unknown>, payload: AutomationEventPayload): Promise<Record<string, unknown>> {
		try {
			const { replaceTokens } = await import('@src/services/token/engine');

			const context = {
				entry: payload.data || {},
				user: {
					...payload.user,
					_id: payload.user?._id || '',
					email: payload.user?.email || 'system@automation',
					role: 'guest',
					permissions: []
				} as any,
				system: { now: payload.timestamp as any },
				// Automation-specific context
				trigger: {
					event: payload.event,
					collection: payload.collection,
					entryId: payload.entryId,
					timestamp: payload.timestamp,
					previous: payload.previousData || {}
				}
			} as any;

			const resolved: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(config)) {
				if (typeof value === 'string' && value.includes('{{')) {
					resolved[key] = await replaceTokens(value, context);
				} else {
					resolved[key] = value;
				}
			}

			return resolved;
		} catch (_err) {
			// Token resolution unavailable, using raw config
			logger.debug('Token resolution unavailable, using raw config');
			return config;
		}
	}

	// ── Stats & Logging ────────────────────────────────────────

	private async updateFlowStats(flowId: string, status: ExecutionStatus): Promise<void> {
		if (!this.flowsCache) {
			return;
		}

		const flow = this.flowsCache.find((f) => f.id === flowId);
		if (flow) {
			flow.lastTriggered = new Date().toISOString();
			flow.triggerCount = (flow.triggerCount || 0) + 1;
			if (status === 'failure') {
				flow.failureCount = (flow.failureCount || 0) + 1;
			}

			// Persist stats update
			const db = await getDbAdapter();
			if (db) {
				await db.systemPreferences.set('automations_config', this.flowsCache, 'system').catch(() => {});
			}
		}
	}

	private addLogEntry(entry: ExecutionLogEntry): void {
		this.executionLogs.unshift(entry);
		if (this.executionLogs.length > this.MAX_LOGS) {
			this.executionLogs = this.executionLogs.slice(0, this.MAX_LOGS);
		}
	}

	/** Get recent execution logs (optionally filtered by automation ID) */
	public getLogs(automationId?: string): ExecutionLogEntry[] {
		if (automationId) {
			return this.executionLogs.filter((l) => l.automationId === automationId);
		}
		return this.executionLogs;
	}

	/** Clear flow cache (force reload on next access) */
	public invalidateCache(): void {
		this.flowsCache = null;
		this.cacheTimestamp = 0;
	}
}

export const automationService = AutomationService.getInstance();
