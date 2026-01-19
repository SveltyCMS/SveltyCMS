/**
 * @file apps/cms/src/services/audit/AuditLogService.ts
 * @description Audit log service for SvelteKit.
 */

import { sha256 } from 'js-sha256';
import { writeFile, readFile, mkdir } from 'fs/promises';
import path from 'path';

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
		} catch (e) {
			console.error('Failed to initialize AuditLogService', e);
		}
	}

	private async readLogs(): Promise<AuditLogEntry[]> {
		try {
			const content = await readFile(path.join(this.logDir, this.currentLogFile), 'utf-8');
			// Handle potentially empty or malformed file
			if (!content.trim()) return [];

			// Assuming JSONL or array. Let's do array for simplicity in MVP
			return JSON.parse(content);
		} catch (e) {
			return [];
		}
	}

	private generateHash(entry: Omit<AuditLogEntry, 'hash'>): string {
		return sha256(JSON.stringify(entry));
	}

	public async getLogs(limit: number = 20): Promise<AuditLogEntry[]> {
		const logs = await this.readLogs();
		// Return latest logs first
		return logs.reverse().slice(0, limit);
	}

	public async log(
		action: string,
		actor: { id: string; email: string; ip: string },
		resource: { type: string; id: string },
		details?: Record<string, any>
	): Promise<AuditLogEntry> {
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
		const logs = await this.readLogs();
		logs.push(entry);
		await writeFile(path.join(this.logDir, this.currentLogFile), JSON.stringify(logs, null, 2));
	}

	public async verifyChain(): Promise<boolean> {
		const logs = await this.readLogs();
		if (logs.length === 0) return true;

		let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';
		for (const entry of logs) {
			if (entry.previousHash !== prevHash) {
				console.error(`Broken chain at entry ${entry.id}. Expected prevHash ${prevHash}, got ${entry.previousHash}`);
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
				console.error(`Tampered entry ${entry.id}. Calculated ${recalculatedHash}, stored ${entry.hash}`);
				return false;
			}
			prevHash = entry.hash;
		}
		return true;
	}
}

export const auditLogService = new AuditLogService();
