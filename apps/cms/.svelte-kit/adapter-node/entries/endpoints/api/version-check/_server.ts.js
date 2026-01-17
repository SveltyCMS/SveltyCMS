import { json } from '@sveltejs/kit';
import { version } from '../../../../chunks/package.js';
const compareSemver = (a, b) => {
	const aParts = a.split('.').map(Number);
	const bParts = b.split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		if (aParts[i] > bParts[i]) return 1;
		if (aParts[i] < bParts[i]) return -1;
	}
	return 0;
};
const GET = async () => {
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
		const remoteVersion = latestRelease.tag_name.replace('v', '');
		const comparison = compareSemver(version, remoteVersion);
		let status = 'match';
		if (comparison < 0) {
			const localParts = version.split('.').map(Number);
			const remoteParts = remoteVersion.split('.').map(Number);
			if (localParts[0] < remoteParts[0]) {
				status = 'major';
			} else {
				status = 'minor';
			}
		}
		return json({
			status,
			local: version,
			remote: remoteVersion
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ status: 'error', message }, { status: 500 });
	}
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
