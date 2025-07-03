/**
 * @file src/utils/fileUploading.ts
 * @description ..
 **/

import * as fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from './logger.svelte';
import { publicEnv } from '@root/config/public';

const getRootPath = () => {
	// Use process.cwd() which is more reliable across different runtimes
	const cwd = process.cwd();
	logger.debug(`getRootPath debug - process.cwd(): "${cwd}"`);
	return cwd;
};

export async function uploadFile(file: File, folder?: string, onProgress?: (progress: number) => void) {
	// Validate file
	if (!file || file.size === 0) {
		throw new Error('Invalid file provided');
	}

	// Validate file size (max 50MB)
	const MAX_FILE_SIZE = 50 * 1024 * 1024;
	if (file.size > MAX_FILE_SIZE) {
		throw new Error(`File size exceeds maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
	}

	// Construct safe directory path
	const safeFolder = folder ? path.normalize(folder).replace(/^(\.\.(\/|\\|$))+/, '') : undefined;
	const directoryPath = safeFolder ? path.join(getRootPath(), publicEnv.MEDIA_FOLDER, safeFolder) : path.join(getRootPath(), publicEnv.MEDIA_FOLDER);

	try {
		// Ensure directory exists
		await fs.mkdir(directoryPath, { recursive: true });

		// Create safe filename
		const safeFilename = file.name.replace(/[^a-zA-Z0-9\-_.]/g, '_');
		const filePath = path.join(directoryPath, safeFilename);

		// Check if file already exists
		try {
			await fs.access(filePath);
			throw new Error(`File "${safeFilename}" already exists`);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
				logger.warn('Unexpected error checking file existence:', err);
				throw err;
			}
			// File doesn't exist, proceed with upload
		}

		// Write file with progress tracking
		const fileData = await file.arrayBuffer();
		if (onProgress) onProgress(0);

		await fs.writeFile(filePath, new DataView(fileData));
		if (onProgress) onProgress(100);

		logger.info('File saved successfully:', filePath);
		return {
			success: true,
			path: filePath,
			filename: safeFilename
		};
	} catch (err) {
		logger.error('Error uploading file:', err);
		throw err; // Re-throw for caller to handle
	}
}

export async function createDirectory(relativePath: string) {
	// Validate folder path
	if (typeof relativePath !== 'string') {
		// Adding a specific check for string type to prevent the error
		throw new Error('Folder path must be a string.');
	}
	const trimmedPath = relativePath.trim();

	// Sanitize folder name to prevent directory traversal attacks
	const safeRelativePath = path.normalize(trimmedPath).replace(/^(\.\.(\/|\\|$))+/, '');

	// Debug the path components
	const rootPath = getRootPath();
	const mediaFolder = publicEnv.MEDIA_FOLDER;
	logger.debug(`createDirectory debug - rootPath: "${rootPath}", mediaFolder: "${mediaFolder}", safeRelativePath: "${safeRelativePath}"`);
	logger.debug(
		`createDirectory debug - typeof rootPath: ${typeof rootPath}, typeof mediaFolder: ${typeof mediaFolder}, typeof safeRelativePath: ${typeof safeRelativePath}`
	);

	// Validate each component before joining
	if (typeof rootPath !== 'string') {
		throw new Error(`getRootPath() returned non-string: ${typeof rootPath}, value: ${rootPath}`);
	}
	if (typeof mediaFolder !== 'string') {
		throw new Error(`publicEnv.MEDIA_FOLDER is non-string: ${typeof mediaFolder}, value: ${mediaFolder}`);
	}
	if (typeof safeRelativePath !== 'string') {
		throw new Error(`safeRelativePath is non-string: ${typeof safeRelativePath}, value: ${safeRelativePath}`);
	}

	// Construct the full absolute path
	const directoryPath = path.join(rootPath, mediaFolder, safeRelativePath);
	logger.debug(`createDirectory - constructed directoryPath: "${directoryPath}"`);

	try {
		// The `recursive: true` option ensures that the directory is created if it
		// doesn't exist, and it doesn't throw an error if it already exists.
		// This makes the function idempotent.
		await fs.mkdir(directoryPath, { recursive: true });
		logger.info(`Directory ensured: ${directoryPath}`);
		return {
			success: true,
			path: directoryPath
		};
	} catch (err) {
		logger.error('Error creating directory:', err);
		throw err;
	}
}

export async function deleteDirectory(folder: string, force = false) {
	// Validate folder name
	if (!folder || !folder.trim()) {
		throw new Error('Folder name cannot be empty');
	}

	// Sanitize folder path
	const safeFolder = path.normalize(folder.trim()).replace(/^(\.\.(\/|\\|$))+/, '');
	const directoryPath = path.join(getRootPath(), publicEnv.MEDIA_FOLDER, safeFolder);

	try {
		// Verify directory exists
		await fs.access(directoryPath);

		// Delete directory
		await fs.rm(directoryPath, { recursive: force, force });
		logger.info(`Directory deleted: ${safeFolder}`);
		return {
			success: true,
			path: directoryPath
		};
	} catch (err) {
		logger.error('Error deleting directory:', err);
		throw err;
	}
}
