import * as fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { error } from '@sveltejs/kit';

export async function processImage(buffer: Buffer, destination: string) {
	try {
		const image = sharp(buffer);

		// Ensure directories exist
		await fs.mkdir(path.dirname(destination), { recursive: true });

		// Save original
		await image.toFile(destination);

		// Create thumbnail
		const thumbnailDir = path.join(path.dirname(destination), 'thumbnails');
		const thumbnailPath = path.join(thumbnailDir, path.basename(destination));

		await fs.mkdir(thumbnailDir, { recursive: true });
		await image.resize(200, 200, { fit: 'contain' }).toFile(thumbnailPath);

		return destination;
	} catch (err) {
		throw error(500, `Failed to process image: ${err}`);
	}
}

export async function processDocument(buffer: Buffer, destination: string) {
	try {
		await fs.mkdir(path.dirname(destination), { recursive: true });
		await fs.writeFile(destination, buffer);
		return destination;
	} catch (err) {
		throw error(500, `Failed to save document: ${err}`);
	}
}

export async function deleteMedia(filePath: string) {
	try {
		await fs.unlink(filePath);

		// Try to delete thumbnail if it exists
		const thumbnailPath = path.join(path.dirname(filePath), 'thumbnails', path.basename(filePath));
		await fs.unlink(thumbnailPath).catch(() => {});

		return true;
	} catch (err) {
		throw error(500, `Failed to delete media: ${err}`);
	}
}
