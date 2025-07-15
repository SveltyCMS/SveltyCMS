/**
 * @file scripts/check-env.js
 * @description This script checks if the user's Node.js version meets the requirement in package.json.
 * It is intended to be run as a `pre` script before `dev` or `build`.
 *
 * ### Features
 * - Reads `engines.node` from `package.json` as the single source of truth.
 * - Provides a clear error message if the version is too low.
 * - Exits the process with an error code to prevent subsequent scripts from running.
 */

import fs from 'fs';
import path from 'path';
import pc from 'picocolors';

try {
	// Read and parse package.json to find the required Node.js version
	const packageJsonPath = path.resolve(process.cwd(), 'package.json');
	const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

	// Extract the version string (e.g., ">=20.0.0") from the "engines" field
	const requiredVersionString = packageJson.engines.node;

	// Use a regular expression to safely extract the major version number
	const requiredMajorVersion = parseInt(requiredVersionString.match(/\d+/)[0], 10);

	// Get the major version of the currently running Node.js process
	const currentMajorVersion = parseInt(process.version.slice(1).split('.')[0], 10);

	// Compare the current version to the required version
	if (currentMajorVersion < requiredMajorVersion) {
		console.error(pc.red('❌ Error: Your Node.js version is too old.'));
		console.error(pc.yellow(`\nSveltyCMS requires Node.js version ${requiredVersionString}.`));
		console.error(pc.yellow(`You are currently using Node.js ${process.version}.`));
		console.log('\n');
		console.log(pc.cyan('💡 Please update Node.js to the latest LTS version and try again.'));
		console.log('\n');
		process.exit(1); // Stop the process
	}
} catch (error) {
	console.error(pc.red('❌ Error: Could not check Node.js version.'));
	console.error(pc.yellow('Could not read or parse package.json. Please ensure the file exists and is valid.'));
	process.exit(1);
}
