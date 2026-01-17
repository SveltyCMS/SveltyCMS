import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { version as localVersion } from '@root/package.json';

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

export const GET: RequestHandler = async () => {
	try {
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
			local: localVersion,
			remote: remoteVersion
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ status: 'error', message }, { status: 500 });
	}
};
