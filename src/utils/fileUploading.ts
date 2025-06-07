/**
 * @file src/utils/fileUploading.ts
 * @description ..
 **/

import * as fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from './logger.svelte';
import { publicEnv } from '@root/config/public';

const getRootPath = () => {
	// Use import.meta.path directly for Bun compatibility
	const __dirname = path.dirname(import.meta.path);
	return path.resolve(__dirname, '../../');
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

export async function createDirectory(folder: string) {
	// Validate folder name
	if (!folder || !folder.trim()) {
		throw new Error('Folder name cannot be empty');
	}

	// Sanitize folder name
	const safeFolder = path.normalize(folder.trim()).replace(/^(\.\.(\/|\\|$))+/, '');
	const directoryPath = path.join(getRootPath(), publicEnv.MEDIA_FOLDER, safeFolder);

	try {
		// Check if directory already exists
		try {
			await fs.access(directoryPath);
			throw new Error(`Directory "${safeFolder}" already exists`);
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
				logger.warn('Unexpected error checking directory existence:', err);
				throw err;
			}
			// Directory doesn't exist, proceed with creation
		}

		await fs.mkdir(directoryPath, { recursive: true });
		logger.info(`Directory created: ${safeFolder}`);
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
