/**
 * @file collectionUpdater.ts
 * @description Utility functions for updating collection imports in a SvelteKit CMS project.
 *
 * This file contains two main functions:
 * 1. updateImports(): Updates the imports in the index file of the collections directory.
 *    It reads the collection files, generates import statements, and updates the allCollections object.
 * 2. compare(): A helper function to compare two arrays for equality.
 *
 * The updateImports function checks for changes in the collections directory and updates the index.ts file accordingly.
 * It also runs Prettier on the updated file to ensure consistent formatting.
 *
 * @requires child_process - For executing shell commands
 * @requires fs - File system module
 * @requires @src/utils/logger - Custom logging utility
 */

import { exec } from 'child_process';
import fs from 'fs';

// System Logs
import logger from '@src/utils/logger';

let files: Array<string> = [];
let saveFiles: Array<string> = [];

// This function updates the imports in the index file of the collections directory
export async function updateImports() {
	try {
		// Read the files in the collections directory and filter out specific files
		files = fs.readdirSync('./src/collections').filter((x) => !['index.ts', 'types.ts', 'Auth.ts'].includes(x));

		// Read the contents of the index file
		let indexFile = fs.readFileSync('./src/collections/index.ts', 'utf-8');

		// Remove existing import statements and allCollections declaration from the index file
		indexFile = indexFile.replace(/import \w+ from ["']\.\/.*;\s?/g, '').replace(/const allCollections\s?=\s?.*/g, '');

		// Initialize variables to store import statements and allCollections declaration
		let imports = '';
		let allCollections = 'const allCollections={';
		// Loop through the files and generate import statements and allCollections declaration
		for (const file of files) {
			const name = file.replace('.ts', '');
			imports += `import ${name} from './${name}';\n`;
			allCollections += `${name},`;
		}

		// Remove trailing comma and close the array declaration
		allCollections = allCollections.substring(0, allCollections.length - 1) + '}';

		// Check if the files have changed and update the index file if necessary
		if (!compare(files, saveFiles)) {
			fs.writeFileSync('./src/collections/index.ts', imports + '\n' + allCollections + '\n' + indexFile);
			saveFiles = files;
			logger.info('Updated index.ts file with new imports and collections');
			exec('npx prettier  ./src/collections --write', (error, stdout, stderr) => {
				if (error) {
					logger.error('Error running prettier:', error);
					return;
				}
				logger.info('Prettier output:', { stdout, stderr });
			});
		} else {
			logger.info('No changes detected in the collections, index.ts file not updated');
		}
	} catch (error) {
		logger.error('Error updating imports:', error as Error);
		throw error;
	}
}

// Function to compare two arrays for equality
function compare(arr1: any, arr2: any) {
	try {
		// Sort both arrays
		arr1.sort();
		arr2.sort();

		// Check if the arrays have the same length
		if (arr1.length !== arr2.length) {
			return false;
		}

		// Compare the elements of both arrays
		for (let i = 0; i < arr1.length; i++) {
			if (arr1[i] !== arr2[i]) {
				return false;
			}
		}

		// Return true if the arrays are equal
		return true;
	} catch (error) {
		// Handle any errors that might occur
		logger.error('Error comparing arrays:', error as Error);
		return false;
	}
}
