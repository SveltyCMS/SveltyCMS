import { exec } from 'child_process';
import fs from 'fs';

let files: Array<string> = [];
let saveFiles: Array<string> = [];

// This function updates the imports in the index file of the collections directory
export async function updateImports() {
	// Read the files in the collections directory and filter out specific files
	files = fs
		.readdirSync('./src/collections')
		.filter((x) => !['index.ts', 'types.ts', 'Auth.ts'].includes(x));

	// Read the contents of the index file
	let indexFile = fs.readFileSync('./src/collections/index.ts', 'utf-8');

	// Remove existing import statements and allCollections declaration from the index file
	indexFile = indexFile
		.replace(/import \w+ from ["']\.\/.*;\s?/g, '')
		.replace(/const allCollections\s?=\s?.*/g, '');

	// Initialize variables to store import statements and allCollections declaration
	let imports = '';
	let allCollections = ' const allCollections={';
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
		fs.writeFileSync(
			'./src/collections/index.ts',
			imports + '\n' + allCollections + '\n' + indexFile
		);
		saveFiles = files;
		exec('npx prettier  ./src/collections --write');
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
		console.error(error);
		return false;
	}
}
