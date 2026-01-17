import { json } from '@sveltejs/kit';
import pkg from '../../../../../chunks/package.js';
let cachedRelease = {
	tag: '',
	timestamp: 0
};
const CACHE_CHLL = 1e3 * 60 * 60;
const GET = async () => {
	if (cachedRelease.tag && Date.now() - cachedRelease.timestamp < CACHE_CHLL) {
		return json({
			status: 'active',
			latest: cachedRelease.tag,
			security_issue: false,
			message: ''
		});
	}
	try {
		const response = await fetch('https://api.github.com/repos/SveltyCMS/SveltyCMS/releases/latest', {
			headers: { 'User-Agent': 'SveltyCMS-Instance' },
			signal: AbortSignal.timeout(5e3)
			// 5 second timeout
		});
		if (!response.ok) {
			throw new Error(`GitHub API Error: ${response.status}`);
		}
		const data = await response.json();
		const latestVersion = data.tag_name.replace(/^v/, '');
		cachedRelease = {
			tag: latestVersion,
			timestamp: Date.now()
		};
		return json({
			status: 'active',
			latest: latestVersion,
			security_issue: false,
			message: ''
		});
	} catch (error) {
		console.error('GitHub version check failed:', error);
		return json({
			status: 'error',
			latest: pkg.version,
			security_issue: false,
			message: 'Could not connect to GitHub'
		});
	}
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
