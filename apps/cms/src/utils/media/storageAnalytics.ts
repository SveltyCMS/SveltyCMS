/**
 * @file src/utils/media/storageAnalytics.ts
 * @description Storage usage analytics and insights for media files
 *
 * Features:
 * - **Storage Breakdown**: Analyze storage usage by file type, folder, user, and time.
 * - **Insights & Recommendations**: Generate actionable insights to optimize storage.
 * - **Trends Over Time**: Track storage growth and upload trends monthly.
 * - **Top Consumers**: Identify top files, folders, and users consuming storage.
 * - **Future Predictions**: Forecast future storage needs based on historical data.
 * - **Quota Management**: Monitor storage quota usage and provide alerts.
 */

import type { DatabaseId } from '@src/databases/dbInterface';
import type { MediaBase } from './mediaModels';

export interface StorageBreakdown {
	byType: Map<string, { count: number; size: number; percentage: number }>;
	byFolder: Map<string, { count: number; size: number; percentage: number }>;
	byUser: Map<DatabaseId, { count: number; size: number; percentage: number }>;
	byMonth: Map<string, { count: number; size: number }>; // YYYY-MM
	total: {
		files: number;
		size: number;
		averageFileSize: number;
	};
}

export interface StorageInsight {
	type: 'warning' | 'info' | 'success';
	title: string;
	description: string;
	actionable: boolean;
	action?: {
		label: string;
		data: unknown;
	};
}

export interface StorageTrend {
	period: string; // YYYY-MM
	uploads: number;
	size: number;
	cumulativeSize: number;
	growthRate: number; // percentage
}

/**
 * Analyze storage breakdown
 */
export function analyzeStorage(files: MediaBase[]): StorageBreakdown {
	const byType = new Map<string, { count: number; size: number; percentage: number }>();
	const byFolder = new Map<string, { count: number; size: number; percentage: number }>();
	const byUser = new Map<DatabaseId, { count: number; size: number; percentage: number }>();
	const byMonth = new Map<string, { count: number; size: number }>();

	let totalSize = 0;

	for (const file of files) {
		const size = file.size || 0;
		totalSize += size;

		// By type
		const type = file.type || 'unknown';
		const typeStats = byType.get(type) || { count: 0, size: 0, percentage: 0 };
		typeStats.count++;
		typeStats.size += size;
		byType.set(type, typeStats);

		// By folder
		const folder = file.path?.split('/').slice(0, -1).join('/') || 'root';
		const folderStats = byFolder.get(folder) || { count: 0, size: 0, percentage: 0 };
		folderStats.count++;
		folderStats.size += size;
		byFolder.set(folder, folderStats);

		// By user
		if (file.user) {
			const userStats = byUser.get(file.user as DatabaseId) || { count: 0, size: 0, percentage: 0 };
			userStats.count++;
			userStats.size += size;
			byUser.set(file.user as DatabaseId, userStats);
		}

		// By month
		if (file.createdAt) {
			const month = file.createdAt.substring(0, 7); // YYYY-MM
			const monthStats = byMonth.get(month) || { count: 0, size: 0 };
			monthStats.count++;
			monthStats.size += size;
			byMonth.set(month, monthStats);
		}
	}

	// Calculate percentages
	for (const [type, stats] of byType.entries()) {
		stats.percentage = totalSize > 0 ? (stats.size / totalSize) * 100 : 0;
		byType.set(type, stats);
	}
	for (const [folder, stats] of byFolder.entries()) {
		stats.percentage = totalSize > 0 ? (stats.size / totalSize) * 100 : 0;
		byFolder.set(folder, stats);
	}
	for (const [user, stats] of byUser.entries()) {
		stats.percentage = totalSize > 0 ? (stats.size / totalSize) * 100 : 0;
		byUser.set(user, stats);
	}

	return {
		byType,
		byFolder,
		byUser,
		byMonth,
		total: {
			files: files.length,
			size: totalSize,
			averageFileSize: files.length > 0 ? totalSize / files.length : 0
		}
	};
}

/**
 * Generate storage insights and recommendations
 */
export function generateInsights(files: MediaBase[], breakdown: StorageBreakdown): StorageInsight[] {
	const insights: StorageInsight[] = [];

	// Check for large files
	const largeFiles = files.filter((f) => (f.size || 0) > 10 * 1024 * 1024); // > 10MB
	if (largeFiles.length > 0) {
		const totalLargeSize = largeFiles.reduce((sum, f) => sum + (f.size || 0), 0);
		insights.push({
			type: 'info',
			title: 'Large Files Detected',
			description: `${largeFiles.length} files are larger than 10MB (${formatBytes(totalLargeSize)} total). Consider compressing or archiving them.`,
			actionable: true,
			action: {
				label: 'View Large Files',
				data: largeFiles.map((f) => f._id)
			}
		});
	}

	// Check for old files
	const oneYearAgo = new Date();
	oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
	const oldFiles = files.filter((f) => {
		if (!f.createdAt) return false;
		return new Date(f.createdAt) < oneYearAgo;
	});
	if (oldFiles.length > 0) {
		const totalOldSize = oldFiles.reduce((sum, f) => sum + (f.size || 0), 0);
		insights.push({
			type: 'info',
			title: 'Old Files Found',
			description: `${oldFiles.length} files are older than 1 year (${formatBytes(totalOldSize)}). Archive or delete unused files.`,
			actionable: true,
			action: {
				label: 'View Old Files',
				data: oldFiles.map((f) => f._id)
			}
		});
	}

	// Check for type imbalance
	const topType = Array.from(breakdown.byType.entries()).sort((a, b) => b[1].size - a[1].size)[0];
	if (topType && topType[1].percentage > 70) {
		insights.push({
			type: 'info',
			title: 'Storage Dominated by One Type',
			description: `${topType[0]} files account for ${topType[1].percentage.toFixed(1)}% of storage. Consider organizing or optimizing these files.`,
			actionable: false
		});
	}

	// Check for growth rate
	const months = Array.from(breakdown.byMonth.entries()).sort((a, b) => a[0].localeCompare(b[0]));
	if (months.length >= 3) {
		const recent = months.slice(-3);
		const avgRecentGrowth = recent.reduce((sum, [, stats]) => sum + stats.size, 0) / 3;
		const earlier = months.slice(0, Math.max(1, months.length - 3));
		const avgEarlierGrowth = earlier.reduce((sum, [, stats]) => sum + stats.size, 0) / earlier.length;

		if (avgRecentGrowth > avgEarlierGrowth * 1.5) {
			insights.push({
				type: 'warning',
				title: 'Storage Growth Accelerating',
				description: 'Recent upload activity is 50% higher than average. Monitor storage quotas.',
				actionable: false
			});
		}
	}

	// Check for unused files (no metadata updates)
	const unusedFiles = files.filter((f) => {
		if (!f.createdAt) return false;
		const uploadDate = new Date(f.createdAt);
		const threeMonthsAgo = new Date();
		threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
		return uploadDate < threeMonthsAgo && !f.updatedAt;
	});
	if (unusedFiles.length > 10) {
		const totalUnusedSize = unusedFiles.reduce((sum, f) => sum + (f.size || 0), 0);
		insights.push({
			type: 'info',
			title: 'Potentially Unused Files',
			description: `${unusedFiles.length} files haven't been updated in 3+ months (${formatBytes(totalUnusedSize)}). Review for cleanup.`,
			actionable: true,
			action: {
				label: 'View Unused Files',
				data: unusedFiles.map((f) => f._id)
			}
		});
	}

	// Storage efficiency
	const efficiency = (breakdown.total.size / (files.length * 1024 * 1024)) * 100;
	if (efficiency < 50) {
		insights.push({
			type: 'success',
			title: 'Good Storage Efficiency',
			description: 'Most files are reasonably sized. Storage usage is efficient.',
			actionable: false
		});
	}

	return insights;
}

/**
 * Calculate storage trends over time
 */
export function calculateTrends(files: MediaBase[]): StorageTrend[] {
	const byMonth = new Map<string, { count: number; size: number }>();

	for (const file of files) {
		if (!file.createdAt) continue;
		const month = file.createdAt.substring(0, 7); // YYYY-MM
		const stats = byMonth.get(month) || { count: 0, size: 0 };
		stats.count++;
		stats.size += file.size || 0;
		byMonth.set(month, stats);
	}

	const sorted = Array.from(byMonth.entries()).sort((a, b) => a[0].localeCompare(b[0]));
	const trends: StorageTrend[] = [];
	let cumulativeSize = 0;

	for (let i = 0; i < sorted.length; i++) {
		const [period, stats] = sorted[i];
		cumulativeSize += stats.size;

		const growthRate = i > 0 ? ((stats.size - sorted[i - 1][1].size) / sorted[i - 1][1].size) * 100 : 0;

		trends.push({
			period,
			uploads: stats.count,
			size: stats.size,
			cumulativeSize,
			growthRate
		});
	}

	return trends;
}

/**
 * Get top consumers (files, folders, or users)
 */
export function getTopConsumers<T extends string | DatabaseId>(
	breakdown: Map<T, { count: number; size: number; percentage: number }>,
	limit = 10
): Array<{ key: T; count: number; size: number; percentage: number }> {
	return Array.from(breakdown.entries())
		.map(([key, stats]) => ({ key, ...stats }))
		.sort((a, b) => b.size - a.size)
		.slice(0, limit);
}

/**
 * Predict future storage needs
 */
export function predictStorage(
	trends: StorageTrend[],
	monthsAhead = 6
): {
	predictedSize: number;
	predictedFiles: number;
	confidence: 'low' | 'medium' | 'high';
} {
	if (trends.length < 3) {
		return { predictedSize: 0, predictedFiles: 0, confidence: 'low' };
	}

	// Simple linear regression on last 6 months
	const recentTrends = trends.slice(-6);
	const avgMonthlyGrowth =
		recentTrends.reduce((sum, t, i) => {
			if (i === 0) return 0;
			return sum + (t.cumulativeSize - recentTrends[i - 1].cumulativeSize);
		}, 0) /
		(recentTrends.length - 1);

	const avgMonthlyFiles = recentTrends.reduce((sum, t) => sum + t.uploads, 0) / recentTrends.length;

	const lastTrend = trends[trends.length - 1];
	const predictedSize = lastTrend.cumulativeSize + avgMonthlyGrowth * monthsAhead;
	const predictedFiles = Math.round(avgMonthlyFiles * monthsAhead);

	// Confidence based on trend consistency
	const growthRates = recentTrends.slice(1).map((t) => t.growthRate);
	const avgGrowthRate = growthRates.reduce((sum, r) => sum + r, 0) / growthRates.length;
	const variance = growthRates.reduce((sum, r) => sum + Math.pow(r - avgGrowthRate, 2), 0) / growthRates.length;
	const standardDeviation = Math.sqrt(variance);

	let confidence: 'low' | 'medium' | 'high';
	if (standardDeviation < 10) {
		confidence = 'high';
	} else if (standardDeviation < 30) {
		confidence = 'medium';
	} else {
		confidence = 'low';
	}

	return { predictedSize, predictedFiles, confidence };
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
	if (bytes === 0) return '0 Bytes';

	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Calculate storage quota usage
 */
export function calculateQuotaUsage(
	currentSize: number,
	quotaSize: number
): {
	used: number;
	available: number;
	percentage: number;
	status: 'healthy' | 'warning' | 'critical';
	daysRemaining?: number; // Based on current growth rate
} {
	const used = currentSize;
	const available = quotaSize - currentSize;
	const percentage = (currentSize / quotaSize) * 100;

	let status: 'healthy' | 'warning' | 'critical';
	if (percentage < 70) {
		status = 'healthy';
	} else if (percentage < 90) {
		status = 'warning';
	} else {
		status = 'critical';
	}

	return {
		used,
		available,
		percentage,
		status
	};
}
