import { error } from '@sveltejs/kit';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGzip } from 'zlib';
import { join } from 'path';
import { mkdir, unlink, stat } from 'fs/promises';
import { l as logger } from '../../../../../chunks/logger.server.js';
import { d as dbAdapter } from '../../../../../chunks/db.js';
class TarBuilder {
	entries = [];
	add(name, path, size) {
		this.entries.push({ name, path, size });
	}
	async write(outputPath) {
		const out = createWriteStream(outputPath);
		for (const e of this.entries) {
			const header = Buffer.alloc(512, 0);
			Buffer.from(e.name.slice(0, 99)).copy(header, 0);
			'0000644 \0'.split('').forEach((c, i) => header.writeUInt8(c.charCodeAt(0), 100 + i));
			'0000000 \0'.split('').forEach((c, i) => header.writeUInt8(c.charCodeAt(0), 108 + i));
			'0000000 \0'.split('').forEach((c, i) => header.writeUInt8(c.charCodeAt(0), 116 + i));
			const sizeOct = e.size.toString(8).padStart(11, '0') + '\0';
			Buffer.from(sizeOct).copy(header, 124);
			const mtimeOct =
				Math.floor(Date.now() / 1e3)
					.toString(8)
					.padStart(11, '0') + '\0';
			Buffer.from(mtimeOct).copy(header, 136);
			'        '.split('').forEach((c, i) => header.writeUInt8(c.charCodeAt(0), 148 + i));
			header[156] = 48;
			let sum = 0;
			for (let i = 0; i < 512; i++) sum += header[i];
			const chksum = sum.toString(8).padStart(6, '0') + '\0 ';
			Buffer.from(chksum).copy(header, 148);
			out.write(header);
			const inStream = createReadStream(e.path);
			await new Promise((res, rej) => {
				inStream.on('error', rej);
				inStream.on('end', res);
				inStream.pipe(out, { end: false });
			});
			const pad = 512 - (e.size % 512);
			if (pad < 512) out.write(Buffer.alloc(pad));
		}
		out.write(Buffer.alloc(1024));
		out.end();
		await new Promise((res, rej) => {
			out.on('finish', res);
			out.on('error', rej);
		});
	}
}
async function createBulkArchive(files, outputDir) {
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
function streamArchive(archivePath, filename, setHeader) {
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
async function cleanupArchive(path) {
	try {
		await unlink(path);
	} catch (err) {
		logger.warn('Archive cleanup failed', { path, error: err });
	}
}
const createBulkDownloadArchive = createBulkArchive;
const streamArchiveToResponse = streamArchive;
const POST = async ({ request, locals }) => {
	const { user, tenantId } = locals;
	try {
		if (!user) {
			throw error(401, 'Unauthorized');
		}
		const body = await request.json();
		const { fileIds } = body;
		if (!Array.isArray(fileIds) || fileIds.length === 0) {
			throw error(400, 'Invalid request: fileIds array is required');
		}
		logger.info('Bulk download requested', {
			userId: user._id,
			fileCount: fileIds.length,
			tenantId
		});
		if (!dbAdapter) {
			throw error(500, 'Database not available');
		}
		const filesPromises = fileIds.map(async (id) => {
			if (!dbAdapter) return null;
			const result = await dbAdapter.crud.findOne('MediaItem', { _id: id });
			if (result.success && result.data) {
				return result.data;
			}
			return null;
		});
		const files = (await Promise.all(filesPromises)).filter(Boolean);
		if (files.length === 0) {
			throw error(404, 'No files found');
		}
		logger.debug('Files fetched for bulk download', {
			requested: fileIds.length,
			found: files.length
		});
		const outputDir = '/tmp/archives';
		const archive = await createBulkDownloadArchive(files, outputDir);
		logger.info('Archive created successfully', {
			path: archive.path,
			size: archive.size,
			filename: archive.filename
		});
		const setHeader = (_name, _value) => {};
		const stream = await streamArchiveToResponse(archive.path, archive.filename, setHeader);
		setTimeout(() => {
			cleanupArchive(archive.path).catch((err) => {
				logger.warn('Failed to cleanup archive', { error: err, path: archive.path });
			});
		}, 5e3);
		return new Response(stream, {
			headers: {
				'Content-Type': 'application/gzip',
				'Content-Disposition': `attachment; filename="${archive.filename}"`,
				'Content-Length': archive.size.toString()
			}
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const status = typeof err === 'object' && err !== null && 'status' in err ? err.status : 500;
		logger.error('Bulk download failed', {
			error: message,
			userId: user?._id,
			tenantId
		});
		throw error(status, message);
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
