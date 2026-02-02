/**
 * @file src/services/VersionCheckService.ts
 * @description Service for checking application version against GitHub releases.
 */

import fs from 'fs';
import path from 'path';
import { logger } from '@utils/logger.server';
import { AppError } from '@utils/errorHandling';

export interface VersionCheckResponse {
	status: 'match' | 'minor' | 'major' | 'error';
	local: string;
	remote: string;
}

export class VersionCheckService {
	private static instance: VersionCheckService;

	private constructor() {}

	public static getInstance(): VersionCheckService {
		if (!VersionCheckService.instance) {
			VersionCheckService.instance = new VersionCheckService();
		}
		return VersionCheckService.instance;
	}

	private compareSemver(a: string, b: string): number {
		const aParts = a.split('.').map(Number);
		const bParts = b.split('.').map(Number);

		for (let i = 0; i < 3; i++) {
			if (aParts[i] > bParts[i]) return 1;
			if (aParts[i] < bParts[i]) return -1;
		}
		return 0;
	}

	public async checkVersion(options: { checkUpdates: boolean }): Promise<VersionCheckResponse> {
		try {
			// Use absolute path to ensure correct package.json is read
			// Assuming this service is compiled/run from src/services or similar depth
			// Adjust path if needed: usually project root is resolvable via process.cwd() or relative
			const packageJsonPath = path.resolve(process.cwd(), 'package.json');
			const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
			const { version: localVersion } = JSON.parse(packageJsonContent);

			if (!options.checkUpdates) {
				return {
					status: 'match',
					local: localVersion,
					remote: localVersion
				};
			}

			const response = await fetch('https://api.github.com/repos/Rar9/SveltyCMS/releases/latest', {
				headers: {
					'User-Agent': 'SveltyCMS-Version-Check'
				}
			});

			if (!response.ok) {
				throw new AppError(`GitHub API responded with ${response.status}`, 502, 'GITHUB_API_ERROR');
			}

			const latestRelease = await response.json();
			const remoteVersion = latestRelease.tag_name.replace('v', ''); // remove 'v' prefix if it exists
			const comparison = this.compareSemver(localVersion, remoteVersion);

			let status: 'match' | 'minor' | 'major' | 'error' = 'match';
			if (comparison < 0) {
				const localParts = localVersion.split('.').map(Number);
				const remoteParts = remoteVersion.split('.').map(Number);
				if (localParts[0] < remoteParts[0]) {
					status = 'major';
				} else {
					status = 'minor';
				}
			}

			return {
				status,
				local: localVersion,
				remote: remoteVersion
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			logger.error('Version check failed:', error);
			// Fallback in case of error, ensuring consistent response structure or rethrow?
			// The original code rethrew. Let's rethrow AppError or wrap.
			if (error instanceof AppError) throw error;
			throw new AppError(message, 500, 'VERSION_CHECK_FAILED');
		}
	}
}

export const versionCheckService = VersionCheckService.getInstance();
