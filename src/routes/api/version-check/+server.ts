import { json } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';
import type { RequestHandler } from './$types';

// Simple semver comparison function
const compareSemver = (a: string, b: string) => {
	const aParts = a.split('.').map(Number);
	const bParts = b.split('.').map(Number);

	for (let i = 0; i < 3; i++) {
		if (aParts[i] > bParts[i]) return 1;
		if (aParts[i] < bParts[i]) return -1;
	}
	return 0;
};

export const GET: RequestHandler = async ({ url }) => {
	try {
		// Use absolute path to ensure correct package.json is read
		const packageJsonPath = path.resolve(__dirname, '../../../package.json');
		const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
		const { version: localVersion } = JSON.parse(packageJsonContent);

		// In test mode, skip remote checks to keep responses stable
		if (process.env.TEST_MODE === 'true' || process.env.NODE_ENV === 'test') {
			return json({
				status: 'match',
				version: localVersion,
				currentVersion: localVersion,
				local: localVersion,
				remote: localVersion,
				checkUpdates: url.searchParams.get('checkUpdates') === 'true'
			});
		}

		const response = await fetch('https://api.github.com/repos/Rar9/SveltyCMS/releases/latest', {
			headers: {
				'User-Agent': 'SveltyCMS-Version-Check'
			}
		});
		if (!response.ok) {
			throw new Error(`GitHub API responded with ${response.status}`);
		}
		const latestRelease = await response.json();
		const remoteVersion = latestRelease.tag_name.replace('v', ''); // remove 'v' prefix if it exists
		const comparison = compareSemver(localVersion, remoteVersion);

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

		return json({
			status,
			version: remoteVersion,
			currentVersion: localVersion,
			local: localVersion,
			remote: remoteVersion
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ status: 'error', message }, { status: 200 });
	}
};
