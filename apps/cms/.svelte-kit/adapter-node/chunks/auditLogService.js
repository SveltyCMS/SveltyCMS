import { logger } from './logger.js';
async function getDbAdapter() {
	const { dbAdapter } = await import('./db.js').then((n) => n.e);
	if (!dbAdapter) {
		throw new Error('Database adapter not initialized. Please ensure the database is connected.');
	}
	return dbAdapter;
}
class AuditLogService {
	collectionName = 'auditLogs';
	constructor() {
		this.initializeIndexes();
	}
	/**
	 * Log a security-critical event
	 */
	async logEvent(entry) {
		try {
			const db = await getDbAdapter();
			const auditEntry = {
				...entry,
				timestamp: /* @__PURE__ */ new Date().toISOString(),
				created_at: /* @__PURE__ */ new Date().toISOString(),
				updated_at: /* @__PURE__ */ new Date().toISOString()
			};
			const result = await db.crud.insert(this.collectionName, auditEntry);
			if (!result.success) {
				logger.error('Failed to log audit event', {
					eventType: entry.eventType,
					error: result.error
				});
			}
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
	async queryLogs(options = {}) {
		try {
			const db = await getDbAdapter();
			const filters = {};
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
					filters.timestamp.$gte = options.startDate;
				}
				if (options.endDate) {
					filters.timestamp.$lte = options.endDate;
				}
			}
			const result = await db.crud.findMany(this.collectionName, filters, {
				limit: options.limit || 100,
				offset: options.offset || 0
			});
			if (!result.success) {
				return result;
			}
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
	async getStatistics(days = 30) {
		try {
			const db = await getDbAdapter();
			const startDate = /* @__PURE__ */ new Date();
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
			const result = await db.crud.aggregate(this.collectionName, pipeline);
			if (!result.success) {
				return {
					success: false,
					message: 'Failed to get audit statistics',
					error: { code: 'STATS_FAILED', message: 'Failed to get audit statistics' }
				};
			}
			const stats = {
				totalEvents: 0,
				eventsByType: {},
				eventsBySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
				eventsByResult: { success: 0, failure: 0, partial: 0 },
				period: { start: startDate.toISOString(), end: /* @__PURE__ */ new Date().toISOString() }
			};
			result.data?.forEach((item) => {
				stats.totalEvents += item.count;
				stats.eventsByType[item._id.eventType] = (stats.eventsByType[item._id.eventType] || 0) + item.count;
				stats.eventsBySeverity[item._id.severity] += item.count;
				stats.eventsByResult[item._id.result] += item.count;
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
	async getSuspiciousActivities(limit = 50) {
		const suspiciousEventTypes = [
			'user_login_failed',
			'token_misuse',
			'unauthorized_access',
			'privilege_escalation',
			'data_breach_attempt',
			'suspicious_activity'
			/* SUSPICIOUS_ACTIVITY */
		];
		return this.queryLogs({
			eventTypes: suspiciousEventTypes,
			limit,
			severity: 'high'
		});
	}
	// Clean up old audit logs based on retention policy
	async cleanupOldLogs(retentionDays = 365) {
		try {
			const db = await getDbAdapter();
			const cutoffDate = /* @__PURE__ */ new Date();
			cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
			const result = await db.crud.deleteMany(this.collectionName, {
				timestamp: cutoffDate.toISOString()
			});
			if (result.success && result.data && result.data.deletedCount > 0) {
				logger.info(`Cleaned up ${result.data.deletedCount} old audit log entries`, {
					cutoffDate: cutoffDate.toISOString(),
					retentionDays
				});
			}
		} catch (error) {
			logger.error('Failed to cleanup old audit logs', { error, retentionDays });
		}
	}
	// Initialize database indexes for optimal performance
	async initializeIndexes() {
		try {
			logger.debug('Audit log service initialized');
		} catch (error) {
			logger.error('Failed to initialize audit log indexes', { error });
		}
	}
}
const auditLogService = new AuditLogService();
auditLogService.logEvent.bind(auditLogService);
auditLogService.queryLogs.bind(auditLogService);
auditLogService.getStatistics.bind(auditLogService);
auditLogService.getSuspiciousActivities.bind(auditLogService);
export { auditLogService as a };
//# sourceMappingURL=auditLogService.js.map
