/**
 * @file src/services/audit/AuditLogService.ts
 * @description Audit log service for SvelteKit.
 *
 * Provides a tamper-evident audit log by chaining entries via SHA256 hashes.
 */

import { sha256 } from 'js-sha256';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@utils/logger.server';

export interface AuditLogEntry {
	id: string;
	timestamp: string;
	action: string;
	actor: {
		id: string;
		email: string;
		ip: string;
	};
	resource: {
		type: string;
		id: string;
	};
	details?: Record<string, any>;
	previousHash: string;
	hash: string;
}

export class AuditLogService {
	private readonly logDir = 'logs/audit';
	private readonly currentLogFile = 'audit.json';
	private lastHash: string = '0000000000000000000000000000000000000000000000000000000000000000';
	private initialized = false;

	constructor() {
		this.init();
	}

	private async init() {
		try {
			await mkdir(this.logDir, { recursive: true });
			const logs = await this.readLogs();
			if (logs.length > 0) {
				this.lastHash = logs[logs.length - 1].hash;
			}
			this.initialized = true;
		} catch (e) {
			logger.error('Failed to initialize AuditLogService', { error: e });
		}
	}

	private async readLogs(): Promise<AuditLogEntry[]> {
		try {
			const filePath = path.join(process.cwd(), this.logDir, this.currentLogFile);
			const content = await readFile(filePath, 'utf-8');
			if (!content.trim()) return [];

			return JSON.parse(content);
		} catch (e: any) {
			if (e.code === 'ENOENT') {
				return [];
			}
			logger.error('Failed to read audit logs', { error: e });
			return [];
		}
	}

	private generateHash(entry: Omit<AuditLogEntry, 'hash'>): string {
		return sha256(JSON.stringify(entry));
	}

	/**
	 * Get latest audit logs
	 */
	public async getLogs(limit: number = 20): Promise<AuditLogEntry[]> {
		if (!this.initialized) await this.init();
		const logs = await this.readLogs();
		return logs.reverse().slice(0, limit);
	}

	/**
	 * Log a new action
	 */
	public async log(
		action: string,
		actor: { id: string; email: string; ip: string },
		resource: { type: string; id: string },
		details?: Record<string, any>
	): Promise<AuditLogEntry> {
		if (!this.initialized) await this.init();

		const entry: Omit<AuditLogEntry, 'hash'> = {
			id: crypto.randomUUID(),
			timestamp: new Date().toISOString(),
			action,
			actor,
			resource,
			details,
			previousHash: this.lastHash
		};

		const hash = this.generateHash(entry);
		const fullEntry: AuditLogEntry = { ...entry, hash };

		this.lastHash = hash;
		await this.appendLog(fullEntry);

		return fullEntry;
	}

	private async appendLog(entry: AuditLogEntry) {
		try {
			const logs = await this.readLogs();
			logs.push(entry);
			const filePath = path.join(process.cwd(), this.logDir, this.currentLogFile);
			await writeFile(filePath, JSON.stringify(logs, null, 2));
		} catch (e) {
			logger.error('Failed to append audit log', { error: e });
		}
	}

	/**
	 * Verify the integrity of the audit log chain
	 */
	public async verifyChain(): Promise<boolean> {
		const logs = await this.readLogs();
		if (logs.length === 0) return true;

		let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';
		for (const entry of logs) {
			if (entry.previousHash !== prevHash) {
				logger.error(`Audit chain broken at entry ${entry.id}`, { expected: prevHash, found: entry.previousHash });
				return false;
			}
			const recalculatedHash = this.generateHash({
				id: entry.id,
				timestamp: entry.timestamp,
				action: entry.action,
				actor: entry.actor,
				resource: entry.resource,
				details: entry.details,
				previousHash: entry.previousHash
			});
			if (recalculatedHash !== entry.hash) {
				logger.error(`Tampered audit entry detected: ${entry.id}`, { calculated: recalculatedHash, stored: entry.hash });
				return false;
			}
			prevHash = entry.hash;
		}
		return true;
	}
}

export const auditLogService = new AuditLogService();
