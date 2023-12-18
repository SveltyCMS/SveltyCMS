const config = {
	// Specify the release branches
	branches: ['main'],
	// Specify the plugins to use
	plugins: [
		// Analyze commit messages to determine the next release version
		'@semantic-release/commit-analyzer',
		// Generate release notes based on commit messages
		'@semantic-release/release-notes-generator',
		[
			// Update the version number in the package.json file and create a release commit
			'@semantic-release/git',
			{
				// Specify the files to include in the release commit
				assets: ['dist/.js', 'dist/.js.map'],
				// Specify the format of the release commit message
				message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}'
			}
		],
		[
			// Create a release on GitHub
			'@semantic-release/github',
			{
				// Disable success and failure comments on GitHub issues and pull requests
				successComment: false,
				failComment: false,

				// Create pre-releases with the 'beta' identifier
				prerelease: 'false'
			}
		],
		[
			// Publish the package to npm
			'@semantic-release/npm',
			{
				// Disable publishing to npm
				npmPublish: false
			}
		]
	]
};

module.exports = config;
