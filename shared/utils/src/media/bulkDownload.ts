/**
 * @file shared/utils/src/media/bulkDownload.ts
 * @description Server-side bulk media download as ZIP/TAR.GZ
 *
 * ### Features:
 * - Simple TAR + GZIP (no external deps)
 * - Safe filename sanitization
 * - Progress-ready (extensible)
 * - Stream to response
 * - Automatic cleanup
 */

import { createWriteStream, createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGzip } from 'zlib';
import { join } from 'path';
import { mkdir, unlink, stat } from 'fs/promises';

import type { MediaBase } from './mediaModels';
import { logger } from '@shared/utils/logger.server';

/** Minimal TAR creator */
class TarBuilder {
	entries: { name: string; path: string; size: number }[] = [];

	add(name: string, path: string, size: number) {
		this.entries.push({ name, path, size });
	}

	async write(outputPath: string): Promise<void> {
		const out = createWriteStream(outputPath);

		for (const e of this.entries) {
			const header = Buffer.alloc(512, 0);

			// Name (100 bytes)
			Buffer.from(e.name.slice(0, 99)).copy(header, 0);

			// Mode, uid, gid
			'0000644 \0'.split('').forEach((c, i) => header.writeUInt8(c.charCodeAt(0), 100 + i));
			'0000000 \0'.split('').forEach((c, i) => header.writeUInt8(c.charCodeAt(0), 108 + i));
			'0000000 \0'.split('').forEach((c, i) => header.writeUInt8(c.charCodeAt(0), 116 + i));

			// Size (octal)
			const sizeOct = e.size.toString(8).padStart(11, '0') + '\0';
			Buffer.from(sizeOct).copy(header, 124);

			// Mtime
			const mtimeOct =
				Math.floor(Date.now() / 1000)
					.toString(8)
					.padStart(11, '0') + '\0';
			Buffer.from(mtimeOct).copy(header, 136);

			// Checksum placeholder
			'        '.split('').forEach((c, i) => header.writeUInt8(c.charCodeAt(0), 148 + i));

			// Type: regular file
			header[156] = 48; // '0'

			// Checksum
			let sum = 0;
			for (let i = 0; i < 512; i++) sum += header[i];
			const chksum = sum.toString(8).padStart(6, '0') + '\0 ';
			Buffer.from(chksum).copy(header, 148);

			out.write(header);

			// File data
			const inStream = createReadStream(e.path);
			await new Promise((res, rej) => {
				inStream.on('error', rej);
				inStream.on('end', res);
				inStream.pipe(out, { end: false });
			});

			// Padding
			const pad = 512 - (e.size % 512);
			if (pad < 512) out.write(Buffer.alloc(pad));
		}

		// End of archive
		out.write(Buffer.alloc(1024));
		out.end();

		await new Promise((res, rej) => {
			out.on('finish', res);
			out.on('error', rej);
		});
	}
}

/** Create TAR.GZ archive */
export async function createBulkArchive(files: MediaBase[], outputDir: string): Promise<{ path: string; size: number; filename: string }> {
	const ts = Date.now();
	const tarPath = join(outputDir, `bulk-${ts}.tar`);
	const gzPath = join(outputDir, `bulk-${ts}.tar.gz`);

	try {
		await mkdir(outputDir, { recursive: true });

		const tar = new TarBuilder();
		for (const f of files) {
			if (!f.path || !f.size) continue;
			const name = f.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
			tar.add(name, f.path, f.size);
		}

		await tar.write(tarPath);

		await pipeline(createReadStream(tarPath), createGzip({ level: 6 }), createWriteStream(gzPath));

		await unlink(tarPath);

		const { size } = await stat(gzPath);

		return {
			path: gzPath,
			size,
			filename: `media-bulk-${ts}.tar.gz`
		};
	} catch (err) {
		logger.error('Bulk archive creation failed', err);
		await Promise.allSettled([unlink(tarPath), unlink(gzPath)]);
		throw err;
	}
}

/** Stream archive to response */
export function streamArchive(archivePath: string, filename: string, setHeader: (name: string, value: string) => void): ReadableStream {
	setHeader('Content-Type', 'application/gzip');
	setHeader('Content-Disposition', `attachment; filename="${filename}"`);

	const nodeStream = createReadStream(archivePath);

	return new ReadableStream({
		start(controller) {
			nodeStream.on('data', (chunk) => controller.enqueue(chunk));
			nodeStream.on('end', () => controller.close());
			nodeStream.on('error', (err) => controller.error(err));
		},
		cancel() {
			nodeStream.destroy();
		}
	});
}

/** Cleanup archive file */
export async function cleanupArchive(path: string): Promise<void> {
	try {
		await unlink(path);
	} catch (err) {
		logger.warn('Archive cleanup failed', { path, error: err });
	}
}

/** Aliases for backward compatibility */
export const createBulkDownloadArchive = createBulkArchive;
export const streamArchiveToResponse = streamArchive;
