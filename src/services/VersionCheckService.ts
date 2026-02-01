/**
 * @file src/services/VersionCheckService.ts
 * @description Service for checking application version against remote releases.
 */

import fs from 'fs';
import path from 'path';

export type VersionStatus = 'match' | 'minor' | 'major' | 'error';

export interface VersionCheckResponse {
	status: VersionStatus;
	version: string;
	currentVersion: string;
	local: string;
	remote: string | undefined;
	message?: string;
	checkUpdates?: boolean;
}

class VersionCheckService {
	private readonly repoUrl = 'https://api.github.com/repos/SveltyCMS/SveltyCMS/releases/latest';
	private readonly userAgent = 'SveltyCMS-Version-Check';

	async checkVersion(options?: { checkUpdates?: boolean }): Promise<VersionCheckResponse> {
		const localVersion = this.readLocalVersion();

		try {
			const remoteVersion = await this.fetchRemoteVersion();
			const status = this.compareVersions(localVersion, remoteVersion);

			return {
				status,
				version: remoteVersion,
				currentVersion: localVersion,
				local: localVersion,
				remote: remoteVersion,
				...(options?.checkUpdates !== undefined && { checkUpdates: options.checkUpdates })
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			return {
				status: 'error',
				message,
				version: localVersion,
				currentVersion: localVersion,
				local: localVersion,
				remote: undefined
			};
		}
	}

	private readLocalVersion(): string {
		try {
			const packageJsonPath = path.resolve(process.cwd(), 'package.json');
			const content = fs.readFileSync(packageJsonPath, 'utf-8');
			const { version } = JSON.parse(content);
			return version || 'unknown';
		} catch {
			return 'unknown';
		}
	}

	private async fetchRemoteVersion(): Promise<string> {
		const response = await fetch(this.repoUrl, {
			headers: { 'User-Agent': this.userAgent }
		});

		if (!response.ok) {
			throw new Error(`GitHub API responded with ${response.status}`);
		}

		const data = await response.json();
		return data.tag_name.replace(/^v/, '');
	}

	private compareVersions(local: string, remote: string): VersionStatus {
		const comparison = this.compareSemver(local, remote);

		if (comparison >= 0) {
			return 'match';
		}

		const localParts = local.split('.').map(Number);
		const remoteParts = remote.split('.').map(Number);

		if (localParts[0] < remoteParts[0]) {
			return 'major';
		}

		return 'minor';
	}

	private compareSemver(a: string, b: string): number {
		const aParts = a.split('.').map(Number);
		const bParts = b.split('.').map(Number);

		for (let i = 0; i < 3; i++) {
			if ((aParts[i] || 0) > (bParts[i] || 0)) return 1;
			if ((aParts[i] || 0) < (bParts[i] || 0)) return -1;
		}
		return 0;
	}
}

export const versionCheckService = {
	getInstance: (): VersionCheckService => instance
};

const instance = new VersionCheckService();
