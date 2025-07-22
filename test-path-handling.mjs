/**
 * Test script to verify moveMediaToTrash path handling
 */
import Path from 'path';

// Mock the publicEnv for testing
const publicEnv = {
	MEDIA_FOLDER: 'mediaFiles'
};

function testMoveMediaToTrashPathHandling(url) {
	console.log(`\nTesting URL: "${url}"`);

	// Original logic (what was causing the issue)
	const originalRelativeUrl = url.replace(new RegExp(`^${publicEnv.MEDIA_FOLDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?`), '');
	const originalSourcePath = Path.join(publicEnv.MEDIA_FOLDER, originalRelativeUrl);
	console.log(`Original logic - relativeUrl: "${originalRelativeUrl}", sourcePath: "${originalSourcePath}"`);

	// New logic (fixed)
	let relativeUrl = url;

	// Remove leading slash if present
	if (relativeUrl.startsWith('/')) {
		relativeUrl = relativeUrl.substring(1);
	}

	// Remove MEDIA_FOLDER prefix if present (after removing leading slash)
	const mediaFolderPrefix = `${publicEnv.MEDIA_FOLDER}/`;
	if (relativeUrl.startsWith(mediaFolderPrefix)) {
		relativeUrl = relativeUrl.substring(mediaFolderPrefix.length);
	}

	const sourcePath = Path.join(publicEnv.MEDIA_FOLDER, relativeUrl);
	const trashPath = Path.join(publicEnv.MEDIA_FOLDER, '.trash', Path.basename(relativeUrl));

	console.log(`New logic - relativeUrl: "${relativeUrl}", sourcePath: "${sourcePath}", trashPath: "${trashPath}"`);

	return { relativeUrl, sourcePath, trashPath };
}

// Test various URL formats
const testUrls = [
	'/mediaFiles/avatars/abc123-user-avatar.avif', // Current avatar URL format
	'mediaFiles/avatars/abc123-user-avatar.avif', // Without leading slash
	'/avatars/abc123-user-avatar.avif', // Without mediaFiles prefix
	'avatars/abc123-user-avatar.avif', // Relative path only
	'/mediaFiles/mediaFiles/avatars/abc123-user-avatar.avif' // Double prefix (current bug)
];

testUrls.forEach(testMoveMediaToTrashPathHandling);
