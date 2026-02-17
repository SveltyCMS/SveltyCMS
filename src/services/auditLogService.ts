/**
 * @file src/services/auditLogService.ts
 * @description Audit Log Service for tracking security-critical events
 *
 * This service provides enterprise-grade audit logging for all sensitive operations
 * within the SveltyCMS platform. It ensures compliance, security monitoring, and
 * forensic capabilities.
 *
 * Features:
 * - Immutable audit trail
 * - Structured logging with consistent schema
 * - Performance optimized with minimal overhead
 * - Queryable logs for security analysis
 * - Integration with existing logger infrastructure
 * - Uses agnostic database interface for compatibility
 */

import { dbAdapter as dbAdapterInstance } from '@src/databases/db';
import type { BaseEntity, DatabaseId, DatabaseResult, IDBAdapter } from '@src/databases/dbInterface';
import { logger } from '@utils/logger.server';

// Get the database adapter instance
async function getDbAdapter(): Promise<IDBAdapter> {
	if (!dbAdapterInstance) {
		throw new Error('Database adapter not initialized. Please ensure the database is connected.');
	}
	return dbAdapterInstance;
}

// Additional types for the service
type AuditDetails = Record<string, string | number | boolean | null | undefined>;

// Audit log entry interface extending BaseEntity
export interface AuditLogEntry extends Omit<BaseEntity, 'id' | 'created_at'> {
	action: string; // Human-readable action description
	actorEmail?: string; // For easier querying
	actorId: DatabaseId | null; // User who performed the action
	actorRole?: string;
	correlationId?: string; // For tracking related events
	details: AuditDetails; // Additional context data
	errorDetails?: string; // If result is failure
	eventType: AuditEventType;
	id?: DatabaseId;
	ipAddress?: string;
	result: 'success' | 'failure' | 'partial';
	sessionId?: string;
	severity: AuditSeverity;
	targetId?: DatabaseId | null; // What was affected
	targetType?: string; // 'user', 'token', 'collection', etc.
	timestamp: string;
	userAgent?: string;
}

// Enum for audit event types
export enum AuditEventType {
	// Authentication events
	USER_LOGIN = 'user_login',
	USER_LOGOUT = 'user_logout',
	USER_LOGIN_FAILED = 'user_login_failed',
	PASSWORD_CHANGE = 'password_change',
	PASSWORD_RESET = 'password_reset',
	TWO_FACTOR_ENABLED = 'two_factor_enabled',
	TWO_FACTOR_DISABLED = 'two_factor_disabled',

	// User management events
	USER_CREATED = 'user_created',
	USER_UPDATED = 'user_updated',
	USER_DELETED = 'user_deleted',
	USER_ROLE_CHANGED = 'user_role_changed',
	USER_STATUS_CHANGED = 'user_status_changed',

	// Token management events
	TOKEN_CREATED = 'token_created',
	TOKEN_UPDATED = 'token_updated',
	TOKEN_DELETED = 'token_deleted',
	TOKEN_USED = 'token_used',
	TOKEN_MISUSE = 'token_misuse',

	// Data events
	DATA_EXPORT = 'data_export',
	DATA_IMPORT = 'data_import',
	DATA_DELETION = 'data_deletion',

	// Security events
	UNAUTHORIZED_ACCESS = 'unauthorized_access',
	PRIVILEGE_ESCALATION = 'privilege_escalation',
	DATA_BREACH_ATTEMPT = 'data_breach_attempt',
	SUSPICIOUS_ACTIVITY = 'suspicious_activity'
}

// Severity levels for audit events
export type AuditSeverity = 'low' | 'medium' | 'high' | 'critical';

// Query options for audit logs
export interface AuditQueryOptions {
	actorId?: DatabaseId;
	endDate?: string;
	eventTypes?: AuditEventType[];
	limit?: number;
	offset?: number;
	severity?: AuditSeverity;
	startDate?: string;
	targetId?: DatabaseId;
}

// Statistics interface
export interface AuditStatistics {
	eventsByResult: Record<'success' | 'failure' | 'partial', number>;
	eventsBySeverity: Record<AuditSeverity, number>;
	eventsByType: Record<string, number>;
	period: {
		start: string;
		end: string;
	};
	totalEvents: number;
}

/**
 * Comprehensive audit logging service with enterprise-grade features
 */
export class AuditLogService {
	private readonly collectionName = 'auditLogs';

	constructor() {
		this.initializeIndexes();
	}

	/**
	 * Log a security-critical event
	 */
	async logEvent(entry: Omit<AuditLogEntry, 'timestamp' | 'id' | 'created_at' | 'updated_at'>): Promise<void> {
		try {
			const db = await getDbAdapter();
			const auditEntry: Omit<AuditLogEntry, 'id'> & { created_at?: string; updated_at?: string } = {
				...entry,
				timestamp: new Date().toISOString(),
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			};

			const result = await db.crud.insert<AuditLogEntry>(this.collectionName, auditEntry);

			if (!result.success) {
				logger.error('Failed to log audit event', {
					eventType: entry.eventType,
					error: result.error
				});
			}

			// Log high-severity events to console as well
			if (entry.severity === 'high' || entry.severity === 'critical') {
				logger.warn(`AUDIT: ${entry.eventType} by ${entry.actorEmail || 'unknown'}`, {
					action: entry.action,
					targetType: entry.targetType,
					targetId: entry.targetId,
					result: entry.result
				});
			}
		} catch (error) {
			logger.error('Failed to log audit event', { error, eventType: entry.eventType });
		}
	}

	/**
	 * Query audit logs with filtering
	 */
	async queryLogs(options: AuditQueryOptions = {}): Promise<DatabaseResult<AuditLogEntry[]>> {
		try {
			const { getDb } = await import('@src/databases/db');
			const db = getDb();
			if (!db) {
				throw new Error('Database adapter not initialized');
			}
			const filters: Record<string, unknown> = {};

			if (options.eventTypes?.length) {
				filters.eventType = { $in: options.eventTypes };
			}

			if (options.actorId) {
				filters.actorId = options.actorId;
			}

			if (options.targetId) {
				filters.targetId = options.targetId;
			}

			if (options.severity) {
				filters.severity = options.severity;
			}

			if (options.startDate || options.endDate) {
				filters.timestamp = {};
				if (options.startDate) {
					(filters.timestamp as Record<string, unknown>).$gte = options.startDate;
				}
				if (options.endDate) {
					(filters.timestamp as Record<string, unknown>).$lte = options.endDate;
				}
			}

			const result = await db.crud.findMany<AuditLogEntry>(this.collectionName, filters, {
				limit: options.limit || 100,
				offset: options.offset || 0
			});

			if (!result.success) {
				return result;
			}

			// Sort in memory since findMany doesn't support sort option
			const sortedData = [...result.data].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

			return { success: true, data: sortedData };
		} catch (error) {
			logger.error('Failed to query audit logs', { error, options });
			return {
				success: false,
				message: 'Failed to query audit logs',
				error: { code: 'QUERY_FAILED', message: 'Failed to query audit logs' }
			};
		}
	}

	// Get audit statistics for dashboard
	async getStatistics(days = 30): Promise<DatabaseResult<AuditStatistics>> {
		try {
			const { getDb } = await import('@src/databases/db');
			const db = getDb();
			if (!db) {
				throw new Error('Database adapter not initialized');
			}
			const startDate = new Date();
			startDate.setDate(startDate.getDate() - days);

			const pipeline = [
				{
					$match: {
						timestamp: { $gte: startDate.toISOString() }
					}
				},
				{
					$group: {
						_id: {
							eventType: '$eventType',
							severity: '$severity',
							result: '$result'
						},
						count: { $sum: 1 }
					}
				}
			];

			const result = await db.crud.aggregate<{ _id: { eventType: string; severity: string; result: string }; count: number }>(
				this.collectionName,
				pipeline
			);

			if (!result.success) {
				return {
					success: false,
					message: 'Failed to get audit statistics',
					error: { code: 'STATS_FAILED', message: 'Failed to get audit statistics' }
				};
			} // Process aggregation results into statistics
			const stats: AuditStatistics = {
				totalEvents: 0,
				eventsByType: {},
				eventsBySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
				eventsByResult: { success: 0, failure: 0, partial: 0 },
				period: { start: startDate.toISOString(), end: new Date().toISOString() }
			};

			result.data?.forEach((item) => {
				stats.totalEvents += item.count;

				// Count by event type
				stats.eventsByType[item._id.eventType] = (stats.eventsByType[item._id.eventType] || 0) + item.count;

				// Count by severity
				stats.eventsBySeverity[item._id.severity as AuditSeverity] += item.count;

				// Count by result
				stats.eventsByResult[item._id.result as 'success' | 'failure' | 'partial'] += item.count;
			});

			return { success: true, data: stats };
		} catch (error) {
			logger.error('Failed to get audit statistics', { error });
			return {
				success: false,
				message: 'Failed to get audit statistics',
				error: { code: 'STATS_FAILED', message: 'Failed to get audit statistics' }
			};
		}
	}

	// Get recent suspicious activities
	async getSuspiciousActivities(limit = 50): Promise<DatabaseResult<AuditLogEntry[]>> {
		const suspiciousEventTypes: AuditEventType[] = [
			AuditEventType.USER_LOGIN_FAILED,
			AuditEventType.TOKEN_MISUSE,
			AuditEventType.UNAUTHORIZED_ACCESS,
			AuditEventType.PRIVILEGE_ESCALATION,
			AuditEventType.DATA_BREACH_ATTEMPT,
			AuditEventType.SUSPICIOUS_ACTIVITY
		];

		return this.queryLogs({
			eventTypes: suspiciousEventTypes,
			limit,
			severity: 'high'
		});
	}

	// Clean up old audit logs based on retention policy
	async cleanupOldLogs(retentionDays = 365): Promise<void> {
		try {
			const { getDb } = await import('@src/databases/db');
			const db = getDb();
			if (!db) {
				throw new Error('Database adapter not initialized');
			}
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
			const timestampFilter = { timestamp: { $lte: cutoffDate.toISOString() } } as unknown as Partial<BaseEntity>;

			// Check for Multi-Tenancy
			// We can't easily import privateEnv without circular deps sometimes, so we check db capability
			// Or better, checking if tenants module exists and is populated
			// But let's assume we can check via db adapter if it has tenants module active
			// Actually, safeQuery checks privateEnv.MULTI_TENANT.

			const { getPrivateEnv } = await import('@src/databases/db');
			const isMultiTenant = getPrivateEnv()?.MULTI_TENANT;

			if (isMultiTenant && db.tenants) {
				const tenantsResult = await db.tenants.list();
				if (tenantsResult.success && tenantsResult.data) {
					let totalDeleted = 0;
					for (const tenant of tenantsResult.data) {
						// Delete for each tenant
						// Note: timestampFilter needs to be a query that safeQuery accepts.
						// { timestamp: ... } is fine.
						// We pass tenantId as 3rd arg to deleteMany.
						const result = await db.crud.deleteMany(this.collectionName, timestampFilter, tenant._id);
						if (result.success && result.data) {
							totalDeleted += result.data.deletedCount;
						}
					}
					if (totalDeleted > 0) {
						logger.info(`Cleaned up ${totalDeleted} old audit log entries across tenants`, {
							cutoffDate: cutoffDate.toISOString(),
							retentionDays
						});
					}
				}
			} else {
				// Single Tenant / Global
				// Note: We need to cast because deleteMany expects Partial<BaseEntity>
				// but we're filtering on AuditLogEntry's timestamp field
				const result = await db.crud.deleteMany(this.collectionName, {
					timestamp: cutoffDate.toISOString()
				} as Partial<BaseEntity>);

				if (result.success && result.data && result.data.deletedCount > 0) {
					logger.info(`Cleaned up ${result.data.deletedCount} old audit log entries`, {
						cutoffDate: cutoffDate.toISOString(),
						retentionDays
					});
				}
			}
		} catch (error) {
			logger.error('Failed to cleanup old audit logs', { error, retentionDays });
		}
	}

	// Initialize database indexes for optimal performance
	private async initializeIndexes(): Promise<void> {
		try {
			// Note: Index creation will be handled by the database adapter
			// This is a placeholder for when the adapter supports index creation
			logger.debug('Audit log service initialized');
		} catch (error) {
			logger.error('Failed to initialize audit log indexes', { error });
		}
	}
}

// Export a singleton instance
export const auditLogService = new AuditLogService();

// Export convenience functions
export const logAuditEvent = auditLogService.logEvent.bind(auditLogService);
export const queryAuditLogs = auditLogService.queryLogs.bind(auditLogService);
export const getAuditStatistics = auditLogService.getStatistics.bind(auditLogService);
export const getSuspiciousActivities = auditLogService.getSuspiciousActivities.bind(auditLogService);
