/** @type {import('semantic-release').Options} */
const config = {
	// branches: Defines which branches trigger releases.
	branches: [
		'main', // Full, stable releases from the main branch.
		{
			name: 'next', // Pre-releases from the next branch.
			prerelease: 'next' // Pre-releases will have a suffix like -next.1
		}
	],
	plugins: [
		// Analyzes commit messages to determine the next version number.
		'@semantic-release/commit-analyzer',

		// Generates release notes from the commit messages.
		'@semantic-release/release-notes-generator',

		// Creates or updates a CHANGELOG.md file.
		'@semantic-release/changelog',

		// Updates the version in package.json.
		// We keep publishing to npm disabled as you had it.
		[
			'@semantic-release/npm',
			{
				npmPublish: false
			}
		],

		// Creates a GitHub release.
		'@semantic-release/github',

		// Commits the updated package.json and CHANGELOG.md back to your repo.
		// This MUST run AFTER @semantic-release/github to ensure the release is created first.
		[
			'@semantic-release/git',
			{
				assets: ['package.json', 'CHANGELOG.md'],
				message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}'
			}
		]
	]
};

module.exports = config;
