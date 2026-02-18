/**
 * @file src/utils/media/storageAnalytics.ts
 * @description Storage analytics & insights for media files
 *
 * Features:
 * - Breakdown by type/folder/user/month
 * - Actionable insights
 * - Growth trends
 * - Top consumers
 * - Quota monitoring
 * - Simple prediction
 */

import path from 'node:path';
import type { DatabaseId } from '@src/databases/dbInterface';
import type { MediaBase } from './mediaModels';

/** Storage breakdown */
export interface Breakdown {
	byFolder: Record<string, { count: number; size: number; pct: number }>;
	byMonth: Record<string, { count: number; size: number }>; // YYYY-MM
	byType: Record<string, { count: number; size: number; pct: number }>;
	byUser: Record<DatabaseId, { count: number; size: number; pct: number }>;
	total: {
		files: number;
		size: number;
		avgSize: number;
	};
}

/** Insight card */
export interface Insight {
	action?: { label: string; data: unknown };
	actionable?: boolean;
	desc: string;
	title: string;
	type: 'success' | 'info' | 'warning';
}

/** Monthly trend */
export interface Trend {
	addedSize: number;
	growthPct: number;
	month: string;
	totalSize: number;
	uploads: number;
}

/** Analyze current storage */
export function analyze(files: MediaBase[]): Breakdown {
	const byType: Record<string, any> = {};
	const byFolder: Record<string, any> = {};
	const byUser: Record<DatabaseId, any> = {};
	const byMonth: Record<string, any> = {};

	let totalSize = 0;
	let totalFiles = 0;

	for (const f of files) {
		const size = f.size ?? 0;
		totalSize += size;
		totalFiles++;

		// Type
		const type = f.type ?? 'unknown';
		byType[type] ??= { count: 0, size: 0 };
		byType[type].count++;
		byType[type].size += size;

		// Folder
		const folder = f.path ? path.dirname(f.path) : 'root';
		byFolder[folder] ??= { count: 0, size: 0 };
		byFolder[folder].count++;
		byFolder[folder].size += size;

		// User
		if (f.user) {
			byUser[f.user] ??= { count: 0, size: 0 };
			byUser[f.user].count++;
			byUser[f.user].size += size;
		}

		// Month
		if (f.createdAt) {
			const month = f.createdAt.slice(0, 7);
			byMonth[month] ??= { count: 0, size: 0 };
			byMonth[month].count++;
			byMonth[month].size += size;
		}
	}

	// Percentages
	const addPct = (obj: Record<string, any>) => {
		for (const k in obj) {
			if (!Object.hasOwn(obj, k)) {
				continue;
			}
			obj[k].pct = totalSize ? (obj[k].size / totalSize) * 100 : 0;
		}
	};
	addPct(byType);
	addPct(byFolder);
	addPct(byUser);

	return {
		byType,
		byFolder,
		byUser,
		byMonth,
		total: {
			files: totalFiles,
			size: totalSize,
			avgSize: totalFiles ? totalSize / totalFiles : 0
		}
	};
}

/** Generate insights */
export function insights(files: MediaBase[], breakdown: Breakdown): Insight[] {
	const list: Insight[] = [];

	// Large files (>10MB)
	const large = files.filter((f) => (f.size ?? 0) > 10 * 1024 * 1024);
	if (large.length) {
		const size = large.reduce((s, f) => s + (f.size ?? 0), 0);
		list.push({
			type: 'info',
			title: 'Large Files',
			desc: `${large.length} files >10MB (${formatBytes(size)})`,
			actionable: true,
			action: { label: 'View', data: large.map((f) => f._id) }
		});
	}

	// Old files (>1 year)
	const yearAgo = new Date();
	yearAgo.setFullYear(yearAgo.getFullYear() - 1);
	const old = files.filter((f) => f.createdAt && new Date(f.createdAt) < yearAgo);
	if (old.length) {
		const size = old.reduce((s, f) => s + (f.size ?? 0), 0);
		list.push({
			type: 'info',
			title: 'Old Files',
			desc: `${old.length} files >1 year old (${formatBytes(size)})`,
			actionable: true,
			action: { label: 'View', data: old.map((f) => f._id) }
		});
	}

	// Dominant type
	const topType = Object.entries(breakdown.byType).sort((a, b) => b[1].size - a[1].size)[0];
	if (topType && topType[1].pct > 70) {
		list.push({
			type: 'info',
			title: 'Dominant File Type',
			desc: `${topType[0]} files use ${topType[1].pct.toFixed(1)}% of storage`
		});
	}

	return list;
}

/** Monthly trends */
export function trends(files: MediaBase[]): Trend[] {
	const monthly: Record<string, { count: number; size: number }> = {};

	for (const f of files) {
		if (!f.createdAt) {
			continue;
		}
		const m = f.createdAt.slice(0, 7);
		monthly[m] ??= { count: 0, size: 0 };
		monthly[m].count++;
		monthly[m].size += f.size ?? 0;
	}

	const sorted = Object.keys(monthly).sort();
	const result: Trend[] = [];
	let total = 0;

	for (let i = 0; i < sorted.length; i++) {
		const m = sorted[i];
		const stats = monthly[m];
		total += stats.size;

		const prev = i > 0 ? monthly[sorted[i - 1]].size : 0;
		const growth = prev ? ((stats.size - prev) / prev) * 100 : 0;

		result.push({
			month: m,
			uploads: stats.count,
			addedSize: stats.size,
			totalSize: total,
			growthPct: growth
		});
	}

	return result;
}

/** Top N consumers */
export function top<T extends string | DatabaseId>(
	map: Record<T, { count: number; size: number }>,
	n = 10
): Array<{ key: T; count: number; size: number }> {
	return Object.entries(map)
		.map(([k, v]) => ({ key: k as T, ...(v as any) }))
		.sort((a, b) => b.size - a.size)
		.slice(0, n);
}

/** Simple quota usage */
export function quota(current: number, limit: number) {
	const pct = limit ? (current / limit) * 100 : 0;
	let status: 'healthy' | 'warning' | 'critical' = 'healthy';
	if (pct > 90) {
		status = 'critical';
	} else if (pct > 70) {
		status = 'warning';
	}

	return {
		used: current,
		available: limit - current,
		percentage: pct,
		status
	};
}

/** Human-readable bytes */
export function formatBytes(bytes: number, decimals = 1): string {
	if (bytes === 0) {
		return '0 B';
	}
	const k = 1024;
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	return `${(bytes / k ** i).toFixed(decimals)} ${units[i]}`;
}
