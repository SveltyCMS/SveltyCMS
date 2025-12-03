/**
 * @file src/utils/media/bulkDownload.ts
 * @description Bulk download files as ZIP using Node's built-in zlib and archiver-like functionality
 */

import { createWriteStream, createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGzip } from 'zlib';
import { join } from 'path';
import { mkdir, unlink } from 'fs/promises';
import type { MediaBase } from './mediaModels';
import { logger } from '@utils/logger.server';

/**
 * Simple TAR implementation (no external dependencies)
 * Creates a TAR archive that can be compressed with gzip
 */
class SimpleTar {
	private entries: { name: string; path: string; size: number }[] = [];

	addFile(name: string, path: string, size: number) {
		this.entries.push({ name, path, size });
	}

	async writeToStream(outputPath: string): Promise<void> {
		const output = createWriteStream(outputPath);

		for (const entry of this.entries) {
			// TAR header (512 bytes)
			const header = Buffer.alloc(512);

			// File name (100 bytes)
			Buffer.from(entry.name).copy(header, 0, 0, Math.min(100, entry.name.length));

			// File mode (8 bytes) - "0000644\0"
			Buffer.from('0000644\0').copy(header, 100);

			// Owner ID (8 bytes)
			Buffer.from('0000000\0').copy(header, 108);

			// Group ID (8 bytes)
			Buffer.from('0000000\0').copy(header, 116);

			// File size (12 bytes) - octal
			const sizeOctal = entry.size.toString(8).padStart(11, '0') + '\0';
			Buffer.from(sizeOctal).copy(header, 124);

			// Modification time (12 bytes) - octal timestamp
			const mtime =
				Math.floor(Date.now() / 1000)
					.toString(8)
					.padStart(11, '0') + '\0';
			Buffer.from(mtime).copy(header, 136);

			// Checksum (8 bytes) - initially spaces
			Buffer.from('        ').copy(header, 148);

			// Type flag (1 byte) - '0' for regular file
			header[156] = 48; // '0'

			// Calculate checksum
			let checksum = 0;
			for (let i = 0; i < 512; i++) {
				checksum += header[i];
			}
			const checksumOctal = checksum.toString(8).padStart(6, '0') + '\0 ';
			Buffer.from(checksumOctal).copy(header, 148);

			// Write header
			output.write(header);

			// Write file content
			const fileStream = createReadStream(entry.path);
			await new Promise((resolve, reject) => {
				fileStream.on('end', resolve);
				fileStream.on('error', reject);
				fileStream.pipe(output, { end: false });
			});

			// Padding to 512-byte boundary
			const padding = 512 - (entry.size % 512);
			if (padding < 512) {
				output.write(Buffer.alloc(padding));
			}
		}

		// End of archive (two 512-byte zero blocks)
		output.write(Buffer.alloc(1024));
		output.end();

		await new Promise((resolve, reject) => {
			output.on('finish', resolve);
			output.on('error', reject);
		});
	}
}

// Create a TAR.GZ archive of selected files
export async function createBulkDownloadArchive(files: MediaBase[], outputDir: string): Promise<{ path: string; size: number; filename: string }> {
	const timestamp = Date.now();
	const tarPath = join(outputDir, `media-${timestamp}.tar`);
	const gzPath = join(outputDir, `media-${timestamp}.tar.gz`);

	try {
		// Ensure output directory exists
		await mkdir(outputDir, { recursive: true });

		// Create TAR archive
		const tar = new SimpleTar();

		for (const file of files) {
			if (!file.path || !file.size) continue;

			const sanitizedName = file.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
			tar.addFile(sanitizedName, file.path, file.size);
		}

		await tar.writeToStream(tarPath);

		// Compress with gzip
		const source = createReadStream(tarPath);
		const destination = createWriteStream(gzPath);
		const gzip = createGzip({ level: 6 }); // Balanced compression

		await pipeline(source, gzip, destination);

		// Get file size
		const { size } = await import('fs/promises').then((fs) => fs.stat(gzPath));

		// Clean up TAR file
		await unlink(tarPath);

		return {
			path: gzPath,
			size,
			filename: `media-${timestamp}.tar.gz`
		};
	} catch (error) {
		logger.error('Failed to create bulk download archive:', error);

		// Clean up on error
		try {
			await unlink(tarPath).catch(() => {});
			await unlink(gzPath).catch(() => {});
		} catch (cleanupError) {
			logger.warn('Failed to cleanup after error:', cleanupError);
		}

		throw error;
	}
}

// Stream archive to HTTP response
export async function streamArchiveToResponse(
	archivePath: string,
	filename: string,
	headers: (name: string, value: string) => void
): Promise<ReadableStream> {
	const stream = createReadStream(archivePath);

	headers('Content-Type', 'application/gzip');
	headers('Content-Disposition', `attachment; filename="${filename}"`);

	// Convert Node stream to Web ReadableStream
	const webStream = new ReadableStream({
		start(controller) {
			stream.on('data', (chunk) => controller.enqueue(chunk));
			stream.on('end', () => controller.close());
			stream.on('error', (err) => controller.error(err));
		},
		cancel() {
			stream.destroy();
		}
	});

	return webStream;
}

// Clean up temporary archive file
export async function cleanupArchive(archivePath: string): Promise<void> {
	try {
		await unlink(archivePath);
	} catch (error) {
		logger.warn('Failed to cleanup archive:', error);
	}
}
