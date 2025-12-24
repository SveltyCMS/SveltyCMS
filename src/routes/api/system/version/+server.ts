/**
 * @file src/routes/api/system/version/+server.ts
 * @description API endpoint for checking system version and security updates.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import pkg from '../../../../../package.json';

// In-memory cache to prevent hitting GitHub API rate limits
let cachedRelease = {
	tag: '',
	timestamp: 0
};
const CACHE_CHLL = 1000 * 60 * 60; // 1 hour

export const GET: RequestHandler = async () => {
	// Return cached version if valid
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
			signal: AbortSignal.timeout(5000) // 5 second timeout
		});

		if (!response.ok) {
			throw new Error(`GitHub API Error: ${response.status}`);
		}

		const data = await response.json();
		const latestVersion = data.tag_name.replace(/^v/, '');

		// Update cache
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
		// Fallback to local version on error
		return json({
			status: 'error',
			latest: pkg.version,
			security_issue: false,
			message: 'Could not connect to GitHub'
		});
	}
};
