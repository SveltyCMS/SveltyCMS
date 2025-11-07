/**
 * @file src/utils/media/sharing.ts
 * @description File sharing with expiring links and access control
 *
 * Features:
 * - **Expiring Links**: Create shareable links that expire after a set duration.
 * - **Access Control**: Restrict access via passwords and IP whitelisting.
 * - **Download Limits**: Set maximum download counts for shared files.
 * - **Access Logging**: Track views and downloads with timestamps and IP addresses.
 * - **Link Management**: Revoke or extend share links as needed.
 */

import type { DatabaseId, ISODateString } from '@src/databases/dbInterface';
import { randomBytes } from 'crypto';

export interface ShareLink {
	_id?: DatabaseId;
	token: string;
	fileId: DatabaseId;
	createdBy: DatabaseId;
	createdAt: ISODateString;
	expiresAt: ISODateString;
	maxDownloads?: number;
	downloadCount: number;
	password?: string; // Hashed
	allowedIPs?: string[];
	accessLog: ShareAccessLog[];
	isActive: boolean;
	metadata?: {
		requireEmail?: boolean;
		customMessage?: string;
		notifyOnAccess?: boolean;
	};
}

export interface ShareAccessLog {
	timestamp: ISODateString;
	ipAddress: string;
	userAgent: string;
	action: 'view' | 'download';
	success: boolean;
}

// Generate a secure share token
export function generateShareToken(): string {
	return randomBytes(32).toString('base64url');
}

// Create a new share link
export function createShareLink(
	fileId: DatabaseId,
	userId: DatabaseId,
	options: {
		expiresIn?: number; // hours
		maxDownloads?: number;
		password?: string;
		allowedIPs?: string[];
		requireEmail?: boolean;
		customMessage?: string;
		notifyOnAccess?: boolean;
	} = {}
): ShareLink {
	const now = new Date();
	const expiresIn = options.expiresIn || 24; // Default 24 hours
	const expiresAt = new Date(now.getTime() + expiresIn * 60 * 60 * 1000);

	return {
		token: generateShareToken(),
		fileId,
		createdBy: userId,
		createdAt: now.toISOString() as ISODateString,
		expiresAt: expiresAt.toISOString() as ISODateString,
		maxDownloads: options.maxDownloads,
		downloadCount: 0,
		password: options.password, // Should be hashed before storing
		allowedIPs: options.allowedIPs,
		accessLog: [],
		isActive: true,
		metadata: {
			requireEmail: options.requireEmail,
			customMessage: options.customMessage,
			notifyOnAccess: options.notifyOnAccess
		}
	};
}

//  Validate a share link
export function validateShareLink(
	link: ShareLink,
	options: {
		ipAddress?: string;
		password?: string;
	} = {}
): { valid: boolean; reason?: string } {
	// Check if active
	if (!link.isActive) {
		return { valid: false, reason: 'Link has been deactivated' };
	}

	// Check expiration
	const now = new Date();
	const expiresAt = new Date(link.expiresAt);
	if (now > expiresAt) {
		return { valid: false, reason: 'Link has expired' };
	}

	// Check download limit
	if (link.maxDownloads !== undefined && link.downloadCount >= link.maxDownloads) {
		return { valid: false, reason: 'Download limit reached' };
	}

	// Check IP whitelist
	if (link.allowedIPs && link.allowedIPs.length > 0 && options.ipAddress) {
		if (!link.allowedIPs.includes(options.ipAddress)) {
			return { valid: false, reason: 'Access denied from this IP address' };
		}
	}

	// Check password
	if (link.password && options.password) {
		// In production, use proper password hashing (bcrypt, argon2)
		if (link.password !== options.password) {
			return { valid: false, reason: 'Incorrect password' };
		}
	} else if (link.password && !options.password) {
		return { valid: false, reason: 'Password required' };
	}

	return { valid: true };
}

// Log access to a share link
export function logShareAccess(link: ShareLink, action: 'view' | 'download', ipAddress: string, userAgent: string, success: boolean): ShareLink {
	const logEntry: ShareAccessLog = {
		timestamp: new Date().toISOString() as ISODateString,
		ipAddress,
		userAgent,
		action,
		success
	};

	link.accessLog.push(logEntry);

	// Increment download count
	if (action === 'download' && success) {
		link.downloadCount++;
	}

	return link;
}

// Revoke a share link
export function revokeShareLink(link: ShareLink): ShareLink {
	link.isActive = false;
	return link;
}

// Extend expiration of a share link
export function extendShareLink(link: ShareLink, additionalHours: number): ShareLink {
	const currentExpiry = new Date(link.expiresAt);
	const newExpiry = new Date(currentExpiry.getTime() + additionalHours * 60 * 60 * 1000);
	link.expiresAt = newExpiry.toISOString() as ISODateString;
	return link;
}

// Get share link statistics
export function getShareLinkStats(link: ShareLink): {
	totalAccess: number;
	views: number;
	downloads: number;
	uniqueIPs: number;
	lastAccess?: ISODateString;
	timeRemaining: number; // hours
	downloadsRemaining?: number;
} {
	const views = link.accessLog.filter((log) => log.action === 'view' && log.success).length;
	const downloads = link.accessLog.filter((log) => log.action === 'download' && log.success).length;
	const uniqueIPs = new Set(link.accessLog.map((log) => log.ipAddress)).size;
	const lastAccess = link.accessLog.length > 0 ? link.accessLog[link.accessLog.length - 1].timestamp : undefined;

	const now = new Date();
	const expiresAt = new Date(link.expiresAt);
	const timeRemaining = Math.max(0, (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));

	const downloadsRemaining = link.maxDownloads !== undefined ? link.maxDownloads - link.downloadCount : undefined;

	return {
		totalAccess: link.accessLog.length,
		views,
		downloads,
		uniqueIPs,
		lastAccess,
		timeRemaining,
		downloadsRemaining
	};
}

// Clean up expired share links
export function cleanupExpiredLinks(links: ShareLink[]): {
	active: ShareLink[];
	expired: ShareLink[];
} {
	const now = new Date();
	const active: ShareLink[] = [];
	const expired: ShareLink[] = [];

	for (const link of links) {
		const expiresAt = new Date(link.expiresAt);
		if (link.isActive && now <= expiresAt) {
			active.push(link);
		} else {
			expired.push(link);
		}
	}

	return { active, expired };
}
