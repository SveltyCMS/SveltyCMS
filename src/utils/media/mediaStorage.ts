/**
 * @file mediaStorage.ts
 * @description Core media storage functionality for the CMS.
 * This module handles all file system operations and media processing.
 */

import { publicEnv } from '@root/config/public';
import { error } from '@sveltejs/kit';
import fs from 'fs';
import Path from 'path';
import mime from 'mime-types';
import crypto from 'crypto';
import Sharp from 'sharp';
import { setCache } from '@root/src/databases/redis';
import type { MediaRemoteVideo, MediaAccess, MediaImage, ResizedImage } from './mediaModels';
import { MediaTypeEnum, Permission } from './mediaModels';
import { hashFileContent, getSanitizedFileName } from './mediaProcessing';
import { constructUrl } from './mediaUtils';
import { sanitize } from '@utils/utils';
import { dbAdapter } from '@src/databases/db';
import { logger } from '@utils/logger';
import type { S3 } from 'aws-sdk';

// Image sizes configuration
type ImageSizesType = typeof publicEnv.IMAGE_SIZES & {
    original: 0;
    thumbnail: 200;
};

const SIZES: ImageSizesType = {
    ...publicEnv.IMAGE_SIZES,
    original: 0,
    thumbnail: 200
} as const;

// S3 client singleton
let s3Client: S3 | null = null;

/**
 * Gets or initializes the S3 client for cloud storage operations
 */
async function getS3Client(): Promise<S3 | null> {
    if (typeof window !== 'undefined') return null;

    if (!s3Client) {
        try {
            const AWS = await import('aws-sdk');
            s3Client = new AWS.S3({
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                region: process.env.AWS_REGION
            });
        } catch (error) {
            logger.error('AWS SDK is not installed. S3 functionality will not be available.', error as Error);
            return null;
        }
    }
    return s3Client;
}

/**
 * Resizes an image using Sharp
 */
export async function resizeImage(buffer: Buffer, width: number, height?: number): Promise<Buffer> {
    try {
        const image = Sharp(buffer);
        const resizeOptions: Sharp.ResizeOptions = {
            width,
            height,
            fit: 'inside',
            withoutEnlargement: true
        };
        
        return await image.resize(resizeOptions).toBuffer();
    } catch (err) {
        const message = `Error resizing image: ${err instanceof Error ? err.message : String(err)}`;
        logger.error(message);
        throw new Error(message);
    }
}

/**
 * Saves a file to disk or cloud storage
 */
export async function saveFileToDisk(buffer: Buffer, url: string): Promise<void> {
    if (publicEnv.MEDIASERVER_URL) {
        const s3 = await getS3Client();
        if (s3) {
            await s3
                .putObject({
                    Bucket: process.env.AWS_S3_BUCKET || '',
                    Key: url,
                    Body: buffer,
                    ContentType: mime.lookup(url) || 'application/octet-stream'
                })
                .promise();
        } else {
            throw Error('S3 client is not available. Unable to save file to cloud storage.');
        }
    } else {
        const fullPath = Path.join(publicEnv.MEDIA_FOLDER, url);
        const dir = Path.dirname(fullPath);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(fullPath, buffer);
    }
    logger.info('File saved', { url });
}

/**
 * Saves resized versions of an image
 */
export async function saveResizedImages(
    buffer: Buffer,
    hash: string,
    fileName: string,
    collectionTypes: string,
    ext: string,
    path: string
): Promise<Record<string, ResizedImage>> {
    const format =
        publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format === 'original'
            ? (ext as keyof Sharp.FormatEnum)
            : (publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format as keyof Sharp.FormatEnum);

    const thumbnails: Record<string, ResizedImage> = {};

    for (const size of Object.keys(SIZES) as Array<keyof typeof SIZES>) {
        if (size === 'original') continue;
        const resizedImage = await resizeImage(buffer, SIZES[size]);

        const resizedUrl = constructUrl(path, hash, `${fileName}-${size}`, format, collectionTypes);
        await saveFileToDisk(resizedImage, resizedUrl);

        thumbnails[size] = {
            url: resizedUrl,
            width: resizedImage.width,
            height: resizedImage.height
        };

        logger.info('Resized image saved', { url: resizedUrl, size });
    }
    return thumbnails;
}

/**
 * Deletes a file from storage (disk or cloud)
 */
export async function deleteFile(url: string): Promise<void> {
    if (publicEnv.MEDIASERVER_URL) {
        const s3 = await getS3Client();
        if (!s3) throw Error('S3 client is not available.');

        await s3
            .deleteObject({
                Bucket: process.env.AWS_S3_BUCKET || '',
                Key: url
            })
            .promise();
        logger.info('File deleted from S3', { url });
    } else {
        const filePath = Path.join(publicEnv.MEDIA_FOLDER, url);
        fs.unlinkSync(filePath);
        logger.info('File deleted from local disk', { url });
    }
}

/**
 * Retrieves a file from storage (disk or cloud)
 */
export async function getFile(url: string): Promise<Buffer> {
    if (publicEnv.MEDIASERVER_URL) {
        const s3 = await getS3Client();
        if (!s3) throw Error('S3 client is not available.');

        const data = await s3
            .getObject({
                Bucket: process.env.AWS_S3_BUCKET || '',
                Key: url
            })
            .promise();

        logger.info('File retrieved from S3', { url });
        return Buffer.from(data.Body as ArrayBuffer);
    } else {
        const filePath = Path.join(publicEnv.MEDIA_FOLDER, url);
        if (!fs.existsSync(filePath)) throw error(404, 'File not found');

        const buffer = fs.readFileSync(filePath);
        logger.info('File retrieved from local disk', { url });
        return buffer;
    }
}

/**
 * Checks if a file exists in storage (disk or cloud)
 */
export async function fileExists(url: string): Promise<boolean> {
    if (publicEnv.MEDIASERVER_URL) {
        const s3 = await getS3Client();
        if (!s3) throw Error('S3 client is not available.');

        try {
            await s3
                .headObject({
                    Bucket: process.env.AWS_S3_BUCKET || '',
                    Key: url
                })
                .promise();
            logger.info('File exists in S3', { url });
            return true;
        } catch (error) {
            if (error instanceof Error && error.message.includes('NotFound')) return false;
            throw error;
        }
    } else {
        const filePath = Path.join(publicEnv.MEDIA_FOLDER, url);
        const exists = fs.existsSync(filePath);
        logger.info('File exists on local disk', { url, exists });
        return exists;
    }
}

/**
 * Cleans up media directory by removing unused files
 */
export async function cleanMediaDirectory(): Promise<void> {
    logger.info('Media directory cleanup triggered.');
}

/**
 * Moves a file to the trash folder
 */
export async function moveMediaToTrash(url: string, collectionTypes: string): Promise<void> {
    try {
        if (!url) {
            throw new Error('URL is required');
        }

        const trashDir = Path.join(publicEnv.MEDIA_FOLDER, '.trash');

        // Create trash directory if it doesn't exist
        if (!fs.existsSync(trashDir)) {
            fs.mkdirSync(trashDir, { recursive: true });
        }

        if (publicEnv.MEDIASERVER_URL) {
            // Handle S3 storage
            const s3 = await getS3Client();
            if (!s3) {
                throw new Error('S3 client is not available');
            }

            // Copy to trash folder in S3
            const trashKey = `.trash/${Path.basename(url)}`;
            await s3
                .copyObject({
                    Bucket: process.env.AWS_S3_BUCKET || '',
                    CopySource: `${process.env.AWS_S3_BUCKET}/${url}`,
                    Key: trashKey
                })
                .promise();

            // Delete original
            await s3
                .deleteObject({
                    Bucket: process.env.AWS_S3_BUCKET || '',
                    Key: url
                })
                .promise();

            logger.info('File moved to trash in S3', { originalUrl: url, trashUrl: trashKey });
        } else {
            // Handle local storage
            const sourcePath = Path.join(url);
            const trashPath = Path.join(trashDir, Path.basename(url));

            if (!fs.existsSync(sourcePath)) {
                throw new Error('Source file does not exist');
            }

            // Move file to trash
            fs.renameSync(sourcePath, trashPath);
            logger.info('File moved to trash locally', { originalPath: sourcePath, trashPath });
        }

        // Update database record if available
        if (dbAdapter) {
            const fileRecord = await dbAdapter.findOne(collectionTypes, { url });
            if (fileRecord) {
                await dbAdapter.updateOne(
                    collectionTypes,
                    { _id: fileRecord._id },
                    {
                        $set: {
                            deletedAt: new Date(),
                            status: 'trashed'
                        }
                    }
                );
                logger.info('Database record updated for trashed file', { fileId: fileRecord._id });
            }
        }
    } catch (err) {
        logger.error('Error moving file to trash:', err instanceof Error ? err : new Error(String(err)));
        throw err;
    }
}

/**
 * Saves a remote media file to the database
 */
export async function saveRemoteMedia(
    fileUrl: string,
    collectionTypes: string,
    user_id: string
): Promise<{ id: string; fileInfo: MediaRemoteVideo }> {
    try {
        // Fetch the media file from the provided URL
        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`);

        // Get buffer from fetched response
        const arrayBuffer = await response.arrayBuffer();
        const hash = await hashFileContent(arrayBuffer); // Use arrayBuffer directly for hashing

        // Extract and sanitize the file name
        const fileName = decodeURI(fileUrl.split('/').pop() ?? 'defaultName');
        const { fileNameWithoutExt, ext } = getSanitizedFileName(fileName);
        const url = `remote_media/${hash}-${fileNameWithoutExt}.${ext}`;

        // Create user access entry with all permissions
        const userAccess: MediaAccess = {
            userId: user_id,
            permissions: [Permission.Read, Permission.Write, Permission.Delete]
        };

        // Construct file info object for the remote video
        const fileInfo: MediaRemoteVideo = {
            hash,
            name: fileName,
            path: 'remote_media',
            url,
            type: MediaTypeEnum.RemoteVideo,
            size: parseInt(response.headers.get('content-length') || '0', 10),
            user: user_id,
            createdAt: new Date(),
            updatedAt: new Date(),
            provider: new URL(fileUrl).hostname,
            externalId: fileUrl,
            versions: [
                {
                    version: 1,
                    url,
                    createdAt: new Date(),
                    createdBy: user_id
                }
            ],
            access: userAccess,
            mimeType: mime.lookup(url) || 'application/octet-stream'
        };

        // Ensure the database adapter is initialized
        if (!dbAdapter) {
            const errorMessage = 'Database adapter is not initialized';
            logger.error(errorMessage);
            throw new Error(errorMessage);
        }

        // Check if the file already exists in the database
        const existingFile = await dbAdapter.findOne('media_remote_videos', { hash });
        if (existingFile) {
            logger.info('Remote file already exists in the database', { fileId: existingFile._id, collection: 'media_remote_videos' });
            return { id: existingFile._id, fileInfo: existingFile as MediaRemoteVideo };
        }

        // Save the file info to the database
        const id = await dbAdapter.insertOne('media_remote_videos', fileInfo);
        await setCache(`media:${id}`, fileInfo, 3600); // Cache for 1 hour

        logger.info('Remote media saved to database', { collectionTypes, fileInfo });
        return { id, fileInfo };
    } catch (error) {
        logger.error('Error saving remote media:', error instanceof Error ? error : new Error(String(error)));
        throw error;
    }
}

/**
 * Saves an avatar image to disk and database
 */
export async function saveAvatarImage(file: File): Promise<string> {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 20);

        const existingFile = dbAdapter ? await dbAdapter.findOne('media_images', { hash }) : null;

        if (existingFile) {
            let fileUrl = existingFile.thumbnail?.url;
            if (publicEnv.MEDIASERVER_URL) {
                fileUrl = `${publicEnv.MEDIASERVER_URL}/${fileUrl}`;
            } else {
                fileUrl = `${publicEnv.MEDIA_FOLDER}/${fileUrl}`;
            }
            return fileUrl;
        }

        const { fileNameWithoutExt } = getSanitizedFileName(file.name);
        const sanitizedBlobName = sanitize(fileNameWithoutExt);

        // For avatars, we only create one AVIF thumbnail
        const resizedImage = await resizeImage(buffer, SIZES.thumbnail);

        const thumbnailUrl = `avatars/${hash}-${sanitizedBlobName}thumbnail.avif`;
        await saveFileToDisk(resizedImage, thumbnailUrl);

        const thumbnail = {
            url: thumbnailUrl,
            width: resizedImage.width,
            height: resizedImage.height
        };

        const fileInfo: MediaImage = {
            hash,
            name: file.name,
            path: 'avatars/original',
            url: thumbnailUrl,
            type: MediaTypeEnum.Image,
            size: buffer.length,
            mimeType: 'image/avif',
            createdAt: new Date(Date.now()),
            updatedAt: new Date(Date.now()),
            versions: [
                {
                    version: 1,
                    url: thumbnailUrl,
                    createdAt: new Date(Date.now()),
                    createdBy: 'system'
                }
            ],
            thumbnail,
            thumbnails: {
                sm: thumbnail,
                md: thumbnail,
                lg: thumbnail
            },
            width: resizedImage.width,
            height: resizedImage.height,
            user: 'system',
            access: {
                permissions: [Permission.Read, Permission.Write]
            }
        };

        if (!dbAdapter) throw Error('Database adapter not initialized.');

        await dbAdapter.insertOne('media_images', fileInfo);

        // Return the thumbnail URL for avatar usage
        let fileUrl = thumbnailUrl;
        if (publicEnv.MEDIASERVER_URL) {
            fileUrl = `${publicEnv.MEDIASERVER_URL}/${fileUrl}`;
        } else {
            fileUrl = `${publicEnv.MEDIA_FOLDER}/${fileUrl}`;
        }

        return fileUrl;
    } catch (err) {
        logger.error('Error saving avatar image:', err as Error);
        throw err;
    }
}

/**
 * Uploads a file to storage (disk or cloud)
 */
export async function uploadFile(
    file: File | Blob,
    userId: string,
    access: MediaAccess
): Promise<{ url: string; fileInfo: MediaImage }> {
    try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const fileName = file instanceof File ? file.name : 'blob';
        const mimeType = file.type || mime.lookup(fileName) || 'application/octet-stream';
        
        const hash = await hashFileContent(buffer);
        const sanitizedFileName = getSanitizedFileName(fileName);
        const ext = Path.extname(sanitizedFileName);
        
        // Generate path based on date and hash
        const date = new Date();
        const path = Path.join(
            date.getFullYear().toString(),
            (date.getMonth() + 1).toString().padStart(2, '0'),
            hash.substring(0, 2)
        );
        
        // Process image if it's an image type
        const isImage = mimeType.startsWith('image/');
        let resizedImages: Record<string, ResizedImage> = {};
        
        if (isImage) {
            resizedImages = await saveResizedImages(buffer, hash, sanitizedFileName, 'media', ext, path);
        }
        
        const url = constructUrl(path, `${hash}${ext}`);
        
        // Save original file
        await saveFileToDisk(buffer, url);
        
        const fileInfo: MediaImage = {
            type: MediaTypeEnum.Image,
            name: sanitizedFileName,
            hash,
            path,
            url,
            mimeType,
            size: buffer.length,
            resized: resizedImages,
            access
        };
        
        return { url, fileInfo };
    } catch (err) {
        const message = `Error uploading file: ${err instanceof Error ? err.message : String(err)}`;
        logger.error(message);
        throw new Error(message);
    }
}
