/**
 * @file src/utils/media/versionHistory.ts
 * @description Track and manage file version history
 *
 * Features:
 * - **Version Tracking**: Maintain a history of file versions with metadata.
 * - **Change Detection**: Identify and log changes between versions.
 * - **Version Comparison**: Compare different versions to see what changed.
 * - **Version Filtering**: Filter versions based on criteria like date, user, or action type.
 * - **Statistics**: Generate statistics about version history (e.g., number of versions, size changes).
 * - **Pruning**: Remove old versions based on retention policies.
 * - **Changelog Generation**: Create human-readable changelogs from version history.
 */

import type { DatabaseId, ISODateString } from '@src/databases/dbInterface';

export interface FileVersion {
	_id?: DatabaseId;
	fileId: DatabaseId;
	versionNumber: number;
	createdAt: ISODateString;
	createdBy: DatabaseId;
	action: 'create' | 'update' | 'replace' | 'metadata_update';
	changes: VersionChange[];
	hash: string; // File content hash
	size: number;
	path?: string; // Path to stored version
	metadata?: {
		reason?: string;
		automated?: boolean;
		restorePoint?: boolean;
	};
}

export interface VersionChange {
	field: string;
	oldValue?: unknown;
	newValue?: unknown;
	type: 'add' | 'modify' | 'remove';
}

export interface VersionComparison {
	fromVersion: number;
	toVersion: number;
	changes: VersionChange[];
	contentChanged: boolean;
	metadataChanged: boolean;
	sizeDifference: number;
}

// Create a new version entry
export function createVersion(
	fileId: DatabaseId,
	userId: DatabaseId,
	action: FileVersion['action'],
	hash: string,
	size: number,
	changes: VersionChange[] = [],
	options: {
		path?: string;
		reason?: string;
		automated?: boolean;
		restorePoint?: boolean;
	} = {}
): FileVersion {
	// Get next version number (would be from DB in production)
	const versionNumber = 1; // Placeholder

	return {
		fileId,
		versionNumber,
		createdAt: new Date().toISOString() as ISODateString,
		createdBy: userId,
		action,
		changes,
		hash,
		size,
		path: options.path,
		metadata: {
			reason: options.reason,
			automated: options.automated,
			restorePoint: options.restorePoint
		}
	};
}

// Compare two versions
export function compareVersions(fromVersion: FileVersion, toVersion: FileVersion): VersionComparison {
	const contentChanged = fromVersion.hash !== toVersion.hash;
	const sizeDifference = toVersion.size - fromVersion.size;

	// Aggregate all changes between versions
	const allChanges: VersionChange[] = [];

	// If there are intermediate versions, collect all changes
	// For now, just use the toVersion changes
	allChanges.push(...toVersion.changes);

	const metadataChanged = allChanges.some((change) => change.field !== 'content' && change.field !== 'size');

	return {
		fromVersion: fromVersion.versionNumber,
		toVersion: toVersion.versionNumber,
		changes: allChanges,
		contentChanged,
		metadataChanged,
		sizeDifference
	};
}

// Detect changes between two objects
export function detectChanges(
	oldObj: Record<string, unknown>,
	newObj: Record<string, unknown>,
	excludeFields: string[] = ['_id', 'updatedAt']
): VersionChange[] {
	const changes: VersionChange[] = [];
	const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

	for (const key of allKeys) {
		if (excludeFields.includes(key)) continue;

		const oldValue = oldObj[key];
		const newValue = newObj[key];

		if (oldValue === undefined && newValue !== undefined) {
			changes.push({ field: key, newValue, type: 'add' });
		} else if (oldValue !== undefined && newValue === undefined) {
			changes.push({ field: key, oldValue, type: 'remove' });
		} else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
			changes.push({ field: key, oldValue, newValue, type: 'modify' });
		}
	}

	return changes;
}

// Filter versions by criteria
export function filterVersions(
	versions: FileVersion[],
	criteria: {
		action?: FileVersion['action'];
		userId?: DatabaseId;
		afterDate?: Date;
		beforeDate?: Date;
		restorePointsOnly?: boolean;
	} = {}
): FileVersion[] {
	return versions.filter((version) => {
		if (criteria.action && version.action !== criteria.action) return false;
		if (criteria.userId && version.createdBy !== criteria.userId) return false;

		const versionDate = new Date(version.createdAt);
		if (criteria.afterDate && versionDate < criteria.afterDate) return false;
		if (criteria.beforeDate && versionDate > criteria.beforeDate) return false;

		if (criteria.restorePointsOnly && !version.metadata?.restorePoint) return false;

		return true;
	});
}

// Get version statistics
export function getVersionStats(versions: FileVersion[]): {
	totalVersions: number;
	totalSize: number;
	averageSize: number;
	contentUpdates: number;
	metadataUpdates: number;
	restorePoints: number;
	oldestVersion?: ISODateString;
	newestVersion?: ISODateString;
	mostActiveUser?: DatabaseId;
} {
	if (versions.length === 0) {
		return {
			totalVersions: 0,
			totalSize: 0,
			averageSize: 0,
			contentUpdates: 0,
			metadataUpdates: 0,
			restorePoints: 0
		};
	}

	const totalSize = versions.reduce((sum, v) => sum + v.size, 0);
	const contentUpdates = versions.filter((v) => v.action === 'create' || v.action === 'update' || v.action === 'replace').length;
	const metadataUpdates = versions.filter((v) => v.action === 'metadata_update').length;
	const restorePoints = versions.filter((v) => v.metadata?.restorePoint).length;

	// Sort by date to find oldest/newest
	const sorted = [...versions].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

	// Find most active user
	const userCounts = new Map<DatabaseId, number>();
	for (const version of versions) {
		userCounts.set(version.createdBy, (userCounts.get(version.createdBy) || 0) + 1);
	}
	const mostActiveUser = Array.from(userCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];

	return {
		totalVersions: versions.length,
		totalSize,
		averageSize: totalSize / versions.length,
		contentUpdates,
		metadataUpdates,
		restorePoints,
		oldestVersion: sorted[0].createdAt,
		newestVersion: sorted[sorted.length - 1].createdAt,
		mostActiveUser
	};
}

// Prune old versions based on retention policy
export function pruneVersions(
	versions: FileVersion[],
	policy: {
		keepLatest?: number; // Keep N latest versions
		keepRestorePoints?: boolean; // Always keep restore points
		olderThanDays?: number; // Delete versions older than N days
		maxTotalSize?: number; // Keep pruning until under size limit (bytes)
	} = {}
): { keep: FileVersion[]; remove: FileVersion[] } {
	const keep: FileVersion[] = [];
	const remove: FileVersion[] = [];

	// Sort by version number descending
	const sorted = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);

	let totalSize = 0;
	const now = new Date();

	for (let i = 0; i < sorted.length; i++) {
		const version = sorted[i];
		let shouldKeep = false;

		// Keep latest N versions
		if (policy.keepLatest !== undefined && i < policy.keepLatest) {
			shouldKeep = true;
		}

		// Keep restore points
		if (policy.keepRestorePoints && version.metadata?.restorePoint) {
			shouldKeep = true;
		}

		// Check age
		if (policy.olderThanDays !== undefined) {
			const versionDate = new Date(version.createdAt);
			const ageInDays = (now.getTime() - versionDate.getTime()) / (1000 * 60 * 60 * 24);
			if (ageInDays > policy.olderThanDays && !shouldKeep) {
				remove.push(version);
				continue;
			}
		}

		// Check total size
		if (policy.maxTotalSize !== undefined) {
			if (totalSize + version.size > policy.maxTotalSize && !shouldKeep) {
				remove.push(version);
				continue;
			}
		}

		keep.push(version);
		totalSize += version.size;
	}

	return { keep, remove };
}

// Generate version changelog
export function generateChangelog(versions: FileVersion[]): string {
	const sorted = [...versions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

	let changelog = '# Version History\n\n';

	for (const version of sorted) {
		const date = new Date(version.createdAt).toLocaleString();
		changelog += `## Version ${version.versionNumber} - ${version.action}\n`;
		changelog += `*${date}*\n\n`;

		if (version.metadata?.reason) {
			changelog += `**Reason:** ${version.metadata.reason}\n\n`;
		}

		if (version.changes.length > 0) {
			changelog += '**Changes:**\n';
			for (const change of version.changes) {
				const action = change.type === 'add' ? 'Added' : change.type === 'remove' ? 'Removed' : 'Modified';
				changelog += `- ${action} \`${change.field}\``;
				if (change.oldValue !== undefined) {
					changelog += ` from \`${JSON.stringify(change.oldValue)}\``;
				}
				if (change.newValue !== undefined) {
					changelog += ` to \`${JSON.stringify(change.newValue)}\``;
				}
				changelog += '\n';
			}
		}

		changelog += '\n';
	}

	return changelog;
}