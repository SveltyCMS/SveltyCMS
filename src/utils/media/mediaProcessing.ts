/**
 * @file utils/media/mediaProcessing.ts
 * @description Handles media processing operations such as metadata extraction and thumbnail generation.
 */

import { publicEnv } from '@root/config/public';
import { error } from '@sveltejs/kit';
import mime from 'mime-types';
import { Buffer } from 'buffer';
import { sha256, removeExtension, sanitize } from '@utils/utils';
import { MediaTypeEnum } from './mediaModels';
import type { ImageMetadata, MediaImage, MediaAccess, Thumbnail } from './mediaModels';
import { logger } from '@utils/logger';

// Get fs instance for server-side operations
async function getFs() {
    if (!import.meta.env.SSR) {
        throw error(500, 'File operations can only be performed on the server');
    }
    const { default: fs } = await import('fs');
    return fs;
}

// Convert File to Image Element
async function fileToImage(file: File): Promise<HTMLImageElement> {
    if (!import.meta.env.SSR) {
        throw error(500, 'File operations can only be performed on the server');
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();

        reader.onload = (event) => {
            img.src = event.target?.result as string;
        };

        reader.onerror = reject;

        reader.readAsDataURL(file);

        img.onload = () => resolve(img);
        img.onerror = reject;
    });
}

// Extracts metadata from an image file
export async function extractMetadata(file: File): Promise<ImageMetadata> {
    if (!import.meta.env.SSR) {
        throw error(500, 'File operations can only be performed on the server');
    }

    try {
        const img = await fileToImage(file);
        const metadata: ImageMetadata = {
            width: img.width,
            height: img.height,
            format: mime.lookup(file.name) || file.type,
            size: file.size,
            mimeType: file.type
        };

        return metadata;
    } catch (err) {
        const message = `Error extracting image metadata: ${err instanceof Error ? err.message : String(err)}`;
        logger.error(message);
        throw error(500, message);
    }
}

// Hashes the content of a file using SHA-256
export async function hashFileContent(buffer: ArrayBuffer): Promise<string> {
    if (!import.meta.env.SSR) {
        throw error(500, 'File operations can only be performed on the server');
    }

    try {
        return (await sha256(Buffer.from(buffer))).slice(0, 20);
    } catch (err) {
        const message = `Error hashing file content: ${err instanceof Error ? err.message : String(err)}`;
        logger.error(message);
        throw error(500, message);
    }
}

// Sanitizes the filename by removing unsafe characters
export function getSanitizedFileName(fileName: string): { fileNameWithoutExt: string; ext: string } {
    const { name, ext } = removeExtension(fileName);
    return { fileNameWithoutExt: sanitize(name), ext };
}

// Example of resizing an image using the Canvas API
export async function resizeImage(file: File, width: number, height: number): Promise<Blob> {
    if (!import.meta.env.SSR) {
        throw error(500, 'File operations can only be performed on the server');
    }

    try {
        const img = await fileToImage(file);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            return new Promise((resolve, reject) => {
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to create blob from canvas'));
                    }
                }, file.type);
            });
        } else {
            throw new Error('Failed to get canvas context');
        }
    } catch (err) {
        const message = `Error resizing image: ${err instanceof Error ? err.message : String(err)}`;
        logger.error(message);
        throw error(500, message);
    }
}

// Save images dynamically based on publicEnv.IMAGE_SIZES
export async function saveImage(file: File, destination: string, userId: string, access: MediaAccess): Promise<MediaImage> {
    const fs = await getFs();
    
    try {
        const metadata = await extractMetadata(file);
        const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name);
        const hash = await hashFileContent(await file.arrayBuffer());
        const newFileName = `${fileNameWithoutExt}-${hash}${ext}`;

        // Path for the original image
        const originalPath = `${destination}/images/Original/${newFileName}`;
        logger.info(`Saving original image to ${originalPath}`);

        // Path for the thumbnail image
        const thumbnailPath = `${destination}/images/Thumbnails/${newFileName}`;
        logger.info(`Saving thumbnail image to ${thumbnailPath}`);

        // Create directories if they don't exist
        await fs.promises.mkdir(`${destination}/images/Original`, { recursive: true });
        await fs.promises.mkdir(`${destination}/images/Thumbnails`, { recursive: true });

        // Save the original image
        await fs.promises.writeFile(originalPath, Buffer.from(await file.arrayBuffer()));

        // Immediately generate and save the thumbnail
        const thumbnailBlob = await resizeImage(file, 150, 150);
        await fs.promises.writeFile(thumbnailPath, Buffer.from(await thumbnailBlob.arrayBuffer()));

        const thumbnailData: Thumbnail = {
            url: thumbnailPath,
            width: 150,
            height: 150
        };

        // Now process other sizes in the background
        const imageSizes = (Object.keys(publicEnv.IMAGE_SIZES) as Array<keyof typeof publicEnv.IMAGE_SIZES>).map((key) => ({
            name: key,
            width: publicEnv.IMAGE_SIZES[key],
            height: publicEnv.IMAGE_SIZES[key]
        }));

        const thumbnails: Record<string, Thumbnail> = {};

        // Process each size
        for (const { name, width, height } of imageSizes) {
            try {
                if (!width || !height) {
                    throw error(500, 'Each size configuration must include name, width, and height.');
                }

                const resizedBlob = await resizeImage(file, width, height);
                const path = `${destination}/images/${name}/${newFileName}`;
                await fs.promises.mkdir(`${destination}/images/${name}`, { recursive: true });
                await fs.promises.writeFile(path, Buffer.from(await resizedBlob.arrayBuffer()));

                thumbnails[name] = {
                    url: path,
                    width,
                    height
                };

                logger.info(`Processed image size: ${name}`);
            } catch (err) {
                logger.error(`Error processing size ${name}:`, err);
                // Continue with other sizes even if one fails
            }
        }

        const fileInfo: MediaImage = {
            url: originalPath,
            type: MediaTypeEnum.IMAGE,
            name: file.name,
            size: file.size,
            mimeType: file.type,
            width: metadata.width,
            height: metadata.height,
            thumbnails: {
                ...thumbnails,
                thumbnail: thumbnailData
            },
            createdAt: new Date(),
            updatedAt: new Date(),
            userId,
            access
        };

        return fileInfo;
    } catch (err) {
        const message = `Error saving image: ${err instanceof Error ? err.message : String(err)}`;
        logger.error(message);
        throw error(500, message);
    }
}

// Save a document file
export async function saveDocument(file: File, destination: string): Promise<string> {
    const fs = await getFs();
    
    try {
        const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name);
        const hash = await hashFileContent(await file.arrayBuffer());
        const newFileName = `${fileNameWithoutExt}-${hash}${ext}`;
        const fullPath = `${destination}/${newFileName}`;

        logger.info(`Saving document to ${fullPath}`);

        // Here you would typically use a file system API or cloud storage service to save the file
        await fs.promises.writeFile(fullPath, Buffer.from(await file.arrayBuffer()));

        return fullPath;
    } catch (err) {
        const message = `Error saving document: ${err instanceof Error ? err.message : String(err)}`;
        logger.error(message);
        throw error(500, message);
    }
}

// Save an audio file
export async function saveAudio(file: File, destination: string): Promise<string> {
    const fs = await getFs();
    
    try {
        const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name);
        const hash = await hashFileContent(await file.arrayBuffer());
        const newFileName = `${fileNameWithoutExt}-${hash}${ext}`;
        const fullPath = `${destination}/${newFileName}`;

        logger.info(`Saving audio to ${fullPath}`);

        await fs.promises.writeFile(fullPath, Buffer.from(await file.arrayBuffer()));

        return fullPath;
    } catch (err) {
        const message = `Error saving audio: ${err instanceof Error ? err.message : String(err)}`;
        logger.error(message);
        throw error(500, message);
    }
}

// Save a video file
export async function saveVideo(file: File, destination: string): Promise<string> {
    const fs = await getFs();
    
    try {
        const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name);
        const hash = await hashFileContent(await file.arrayBuffer());
        const newFileName = `${fileNameWithoutExt}-${hash}${ext}`;
        const fullPath = `${destination}/${newFileName}`;

        logger.info(`Saving video to ${fullPath}`);

        await fs.promises.writeFile(fullPath, Buffer.from(await file.arrayBuffer()));

        return fullPath;
    } catch (err) {
        const message = `Error saving video: ${err instanceof Error ? err.message : String(err)}`;
        logger.error(message);
        throw error(500, message);
    }
}
