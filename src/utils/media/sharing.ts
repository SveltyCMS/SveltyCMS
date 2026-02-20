/**
 * @file src/utils/media/sharing.ts
 * @description Secure file sharing with expiring links & access controls
 *
 * Features:
 * - Token generation
 * - Expiring links
 * - Password & IP restrictions
 * - Download limits
 * - Access logging
 * - Revoke/extend
 * - Stats & cleanup
 */

import { randomBytes } from 'node:crypto';
import type { DatabaseId, ISODateString } from '@src/content/types';

export interface ShareLink {
	_id?: DatabaseId;
	active: boolean;
	allowedIPs?: string[];
	createdAt: ISODateString;
	createdBy: DatabaseId;
	downloadCount: number;
	expiresAt: ISODateString;
	fileId: DatabaseId;
	logs: ShareLog[];
	maxDownloads?: number;
	meta?: {
		requireEmail?: boolean;
		message?: string;
		notify?: boolean;
	};
	passwordHash?: string; // Store hashed
	token: string;
}

export interface ShareLog {
	action: 'view' | 'download';
	at: ISODateString;
	ip: string;
	ok: boolean;
	ua: string;
}

/** Secure token (base64url, 32 bytes) */
export function newToken(): string {
	return randomBytes(32).toString('base64url');
}

/** Create share link */
export function createLink(
	fileId: DatabaseId,
	userId: DatabaseId,
	opts: {
		hours?: number;
		maxDownloads?: number;
		passwordHash?: string;
		ips?: string[];
		requireEmail?: boolean;
		message?: string;
		notify?: boolean;
	} = {}
): ShareLink {
	const now = new Date();
	const hours = opts.hours ?? 24;
	const expires = new Date(now.getTime() + hours * 3_600_000);

	return {
		token: newToken(),
		fileId,
		createdBy: userId,
		createdAt: now.toISOString() as ISODateString,
		expiresAt: expires.toISOString() as ISODateString,
		maxDownloads: opts.maxDownloads,
		downloadCount: 0,
		passwordHash: opts.passwordHash,
		allowedIPs: opts.ips,
		logs: [],
		active: true,
		meta: {
			requireEmail: opts.requireEmail,
			message: opts.message,
			notify: opts.notify
		}
	};
}

/** Validate access */
export function validateLink(link: ShareLink, ip?: string, passwordHash?: string): { ok: boolean; reason?: string } {
	if (!link.active) {
		return { ok: false, reason: 'inactive' };
	}
	if (new Date() > new Date(link.expiresAt)) {
		return { ok: false, reason: 'expired' };
	}
	if (link.maxDownloads != null && link.downloadCount >= link.maxDownloads) {
		return { ok: false, reason: 'limit' };
	}
	if (link.allowedIPs?.length && ip && !link.allowedIPs.includes(ip)) {
		return { ok: false, reason: 'ip' };
	}
	if (link.passwordHash && passwordHash !== link.passwordHash) {
		return { ok: false, reason: 'password' };
	}

	return { ok: true };
}

/** Log access */
export function logAccess(link: ShareLink, action: 'view' | 'download', ip: string, ua: string, ok: boolean): ShareLink {
	link.logs.push({
		at: new Date().toISOString() as ISODateString,
		ip,
		ua,
		action,
		ok
	});

	if (action === 'download' && ok) {
		link.downloadCount++;
	}

	return link;
}

/** Revoke link */
export function revoke(link: ShareLink): ShareLink {
	link.active = false;
	return link;
}

/** Extend expiration */
export function extend(link: ShareLink, hours: number): ShareLink {
	const expires = new Date(link.expiresAt);
	expires.setHours(expires.getHours() + hours);
	link.expiresAt = expires.toISOString() as ISODateString;
	return link;
}

/** Link statistics */
export function stats(link: ShareLink) {
	const views = link.logs.filter((l) => l.action === 'view' && l.ok).length;
	const downloads = link.logs.filter((l) => l.action === 'download' && l.ok).length;
	const ips = new Set(link.logs.map((l) => l.ip)).size;
	const last = link.logs.at(-1)?.at;

	const remainingHours = Math.max(0, (new Date(link.expiresAt).getTime() - Date.now()) / 3_600_000);
	const remainingDownloads = link.maxDownloads != null ? link.maxDownloads - link.downloadCount : undefined;

	return {
		total: link.logs.length,
		views,
		downloads,
		uniqueIPs: ips,
		lastAccess: last,
		hoursLeft: Math.round(remainingHours),
		downloadsLeft: remainingDownloads
	};
}

/** Filter active/expired links */
export function filterLinks(links: ShareLink[]): {
	active: ShareLink[];
	expired: ShareLink[];
} {
	const now = Date.now();
	const active: ShareLink[] = [];
	const expired: ShareLink[] = [];

	for (const l of links) {
		(l.active && now <= new Date(l.expiresAt).getTime() ? active : expired).push(l);
	}

	return { active, expired };
}
