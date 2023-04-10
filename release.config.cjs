const config = {
	branches: ['main'],
	plugins: [
		'@semantic-release/commit-analyzer',
		'@semantic-release/release-notes-generator',
		'@semantic-release/git',
		[
			'@semantic-release/git',
			{
				assets: ['dist/.js', 'dist/.js.map'],
				message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}'
			}
		],
		[
			'@semantic-release/github',
			{
				successComment: false,
				failComment: false
			}
		],
		[
			'@semantic-release/exec',
			{
				prepareCmd: 'npm version ${nextRelease.version} --no-git-tag-version'
			}
		],
		[
			'@semantic-release/condition-github',
			{
				release: {
					requiredLabels: ['manual release']
				}
			}
		]
	]
};

module.exports = config;
