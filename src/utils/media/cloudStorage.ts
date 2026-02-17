/**
 * @file src/utils/media/cloudStorage.ts
 * @description Cloud storage abstraction layer for S3, R2, and Cloudinary
 *
 * Performace Enhancements:
 * - Singleton S3/Cloudinary clients (reuse connections)
 * - Keep-Alive agents for HTTP/HTTPS
 * - Unified interface exports
 */

import { getPublicSettingSync } from '@src/services/settingsService';
import { error } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import type { StorageType } from './mediaModels';

// Lazy-load clients to avoid init cost if unused
let s3Client: any = null;
let cloudinary: any = null;

// Cloud storage configuration interface
export interface CloudStorageConfig {
	accessKeyId?: string;
	bucketName?: string;
	cloudinaryCloudName?: string;
	endpoint?: string;
	mediaFolder: string;
	publicUrl?: string;
	region?: string;
	secretAccessKey?: string;
	storageType: StorageType;
}

// Get cloud storage configuration from settings
export function getConfig(): CloudStorageConfig {
	const storageType = getPublicSettingSync('MEDIA_STORAGE_TYPE') as StorageType;
	const mediaFolder = getPublicSettingSync('MEDIA_FOLDER') || '';
	const normalizedFolder = mediaFolder.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');

	return {
		storageType,
		bucketName: getPublicSettingSync('MEDIA_BUCKET_NAME') as string | undefined,
		mediaFolder: normalizedFolder,
		region: getPublicSettingSync('MEDIA_CLOUD_REGION'),
		endpoint: getPublicSettingSync('MEDIA_CLOUD_ENDPOINT'),
		publicUrl: getPublicSettingSync('MEDIA_CLOUD_PUBLIC_URL') || getPublicSettingSync('MEDIASERVER_URL'),
		accessKeyId: process.env.MEDIA_ACCESS_KEY_ID,
		secretAccessKey: process.env.MEDIA_SECRET_ACCESS_KEY,
		cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME
	};
}

export function isCloud(): boolean {
	const type = getPublicSettingSync('MEDIA_STORAGE_TYPE');
	return type === 's3' || type === 'r2' || type === 'cloudinary';
}

/** Get S3 Client Singleton with Keep-Alive */
async function getS3Client(config: CloudStorageConfig) {
	if (s3Client) {
		return s3Client;
	}

	const { S3Client } = await import('@aws-sdk/client-s3');
	const { NodeHttpHandler } = await import('@smithy/node-http-handler');
	const { Agent: HttpsAgent } = await import('node:https');
	const { Agent: HttpAgent } = await import('node:http');

	if (!(config.accessKeyId && config.secretAccessKey)) {
		throw error(500, 'S3/R2 credentials missing');
	}

	s3Client = new S3Client({
		region: config.region || 'auto',
		endpoint: config.endpoint,
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey
		},
		requestHandler: new NodeHttpHandler({
			httpsAgent: new HttpsAgent({
				keepAlive: true,
				timeout: 60_000,
				maxSockets: 50
			}),
			httpAgent: new HttpAgent({
				keepAlive: true,
				timeout: 60_000,
				maxSockets: 50
			})
		})
	});

	return s3Client;
}

/** Get Cloudinary Singleton */
async function getCloudinary(config: CloudStorageConfig) {
	if (cloudinary) {
		return cloudinary;
	}

	const lib = await import('cloudinary');
	cloudinary = lib.v2;

	cloudinary.config({
		cloud_name: config.cloudinaryCloudName,
		api_key: process.env.CLOUDINARY_API_KEY,
		api_secret: process.env.CLOUDINARY_API_SECRET,
		secure: true
	});

	return cloudinary;
}

export function getPath(relativePath: string): string {
	const config = getConfig();
	const clean = relativePath.replace(/^\/+/, '');
	return config.mediaFolder ? `${config.mediaFolder}/${clean}` : clean;
}

export function getUrl(relativePath: string): string {
	const config = getConfig();
	if (config.storageType === 'local') {
		return `/files/${relativePath.replace(/^\/+/, '')}`;
	}

	if (!config.publicUrl) {
		// Fallback for Cloudinary if needed, usually handles own URLs
		if (config.storageType === 'cloudinary') {
			return ''; // Cloudinary returns URL on upload
		}
		throw error(500, 'Cloud public URL not configured');
	}

	const fullPath = getPath(relativePath);
	return `${config.publicUrl.replace(/\/+$/, '')}/${fullPath}`;
}

/** Upload file */
export async function upload(buffer: Buffer, relativePath: string): Promise<string> {
	const config = getConfig();
	const fullPath = getPath(relativePath);

	logger.debug('Cloud upload start', { type: config.storageType, path: fullPath });

	if (config.storageType === 's3' || config.storageType === 'r2') {
		const client = await getS3Client(config);
		const { PutObjectCommand } = await import('@aws-sdk/client-s3');
		const mime = (await import('./mediaUtils')).getMimeType(relativePath) || 'application/octet-stream';

		await client.send(
			new PutObjectCommand({
				Bucket: config.bucketName,
				Key: fullPath,
				Body: buffer,
				ContentType: mime
			})
		);
		return getUrl(relativePath);
	}

	if (config.storageType === 'cloudinary') {
		const cld = await getCloudinary(config);
		const publicId = relativePath.replace(/\.[^.]+$/, ''); // Remove ext

		return new Promise((resolve, reject) => {
			const stream = cld.uploader.upload_stream(
				{
					public_id: publicId,
					folder: config.mediaFolder,
					resource_type: 'auto',
					overwrite: true
				},
				(err: any, res: any) => {
					if (err) {
						return reject(err);
					}
					resolve(res.secure_url);
				}
			);
			stream.end(buffer);
		});
	}

	throw error(500, 'Invalid storage type for cloud upload');
}

/** Delete file */
export async function remove(relativePath: string): Promise<void> {
	const config = getConfig();
	const fullPath = getPath(relativePath);

	if (config.storageType === 's3' || config.storageType === 'r2') {
		const client = await getS3Client(config);
		const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
		try {
			await client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: fullPath }));
		} catch (e) {
			logger.warn('S3 delete failed', { error: e });
		}
		return;
	}

	if (config.storageType === 'cloudinary') {
		const cld = await getCloudinary(config);
		const publicId = `${config.mediaFolder}/${relativePath.replace(/\.[^.]+$/, '')}`;
		await cld.uploader.destroy(publicId);
		return;
	}
}

/** Check existence */
export async function exists(relativePath: string): Promise<boolean> {
	const config = getConfig();
	const fullPath = getPath(relativePath);

	try {
		if (config.storageType === 's3' || config.storageType === 'r2') {
			const client = await getS3Client(config);
			const { HeadObjectCommand } = await import('@aws-sdk/client-s3');
			await client.send(new HeadObjectCommand({ Bucket: config.bucketName, Key: fullPath }));
			return true;
		}

		if (config.storageType === 'cloudinary') {
			const cld = await getCloudinary(config);
			const publicId = `${config.mediaFolder}/${relativePath.replace(/\.[^.]+$/, '')}`;
			await cld.api.resource(publicId);
			return true;
		}
	} catch {
		return false;
	}
	return false;
}
