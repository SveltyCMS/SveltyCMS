import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import fs from 'fs';
import Path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { publicEnv } from '@root/config/public';
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import logger from '@src/utils/logger';

// Utility functions for file operations
function removeExtension(filename: string) {
	const ext = Path.extname(filename);
	const name = Path.basename(filename, ext);
	return { name, ext };
}

function sanitize(filename: string) {
	return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

// Mocked function to get image model
async function getImageModel(hash: string) {
	// Replace this with actual database logic to find an image by hash
	return null;
}

// Mocked function to save image model
async function saveImageModel(imageData: any) {
	// Replace this with actual database logic to save image data
	return imageData;
}

// Upload avatar image
async function saveAvatarImage(file: File, path: 'avatars' | string): Promise<string> {
	try {
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 20);

		// Use the hash to find existing file
		const existingFile = await getImageModel(hash);

		if (existingFile) {
			let fileUrl = `${publicEnv.MEDIA_FOLDER}/${existingFile.thumbnail.url}`;
			if (publicEnv.MEDIASERVER_URL) {
				fileUrl = `${publicEnv.MEDIASERVER_URL}/${fileUrl}`;
			}
			return fileUrl;
		}

		const { name: fileNameWithoutExt, ext } = removeExtension(file.name);
		const sanitizedBlobName = sanitize(fileNameWithoutExt);
		const format =
			ext === '.svg' ? 'svg' : publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format === 'original' ? ext : publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format;
		const url = `${path}/${hash}-${sanitizedBlobName}.${format}`;

		let resizedBuffer: Buffer;
		let info: any;

		if (format === 'svg') {
			resizedBuffer = buffer;
			info = { width: null, height: null };
		} else {
			const result = await sharp(buffer)
				.rotate()
				.resize({ width: 300 })
				.toFormat(format as keyof import('sharp').FormatEnum, {
					quality: publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.quality
				})
				.toBuffer({ resolveWithObject: true });

			resizedBuffer = result.data;
			info = result.info;
		}

		const finalBuffer = buffer.byteLength < resizedBuffer.byteLength ? buffer : resizedBuffer;

		if (!fs.existsSync(Path.dirname(`${publicEnv.MEDIA_FOLDER}/${url}`))) {
			fs.mkdirSync(Path.dirname(`${publicEnv.MEDIA_FOLDER}/${url}`), { recursive: true });
		}

		fs.writeFileSync(`${publicEnv.MEDIA_FOLDER}/${url}`, finalBuffer);

		const imageData = {
			hash,
			thumbnail: {
				name: `${hash}-${sanitizedBlobName}.${format}`,
				url,
				type: `image/${format}`,
				size: file.size,
				width: info.width,
				height: info.height
			}
		};

		// Save image data and use the hash
		const savedImage = await saveImageModel(imageData);

		let fileUrl = `${publicEnv.MEDIA_FOLDER}/${savedImage.thumbnail.url}`;
		if (publicEnv.MEDIASERVER_URL) {
			fileUrl = `${publicEnv.MEDIASERVER_URL}/${fileUrl}`;
		}

		return fileUrl;
	} catch (error) {
		logger.error('Error in saveAvatarImage:', error);
		throw new Error('Failed to save avatar image');
	}
}

export const POST: RequestHandler = async (event) => {
	try {
		const { request, cookies } = event;
		const sessionId = cookies.get(SESSION_COOKIE_NAME) as string;

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		const user = await auth.validateSession({ sessionId });

		if (!user) {
			logger.warn(`Unauthorized avatar save attempt by session: ${sessionId}`);
			return new Response(JSON.stringify({ message: "You don't have permission to save avatar" }), { status: 403 });
		}

		const data = await request.formData();
		const avatarFile = data.get('avatar') as File;

		if (!avatarFile) {
			logger.warn('No avatar file provided in the request');
			return new Response(JSON.stringify({ message: 'No avatar file provided' }), { status: 400 });
		}

		const avatarUrl = await saveAvatarImage(avatarFile, 'avatars');
		await auth.updateUserAttributes(user.id, { avatar: avatarUrl });

		logger.info(`Avatar saved successfully for user ID: ${user.id}`);
		return new Response(JSON.stringify({ success: true, url: avatarUrl }), { status: 200 });
	} catch (error) {
		const err = error as Error;
		logger.error(`Failed to save avatar: ${err.message}`);
		return new Response(JSON.stringify({ message: 'Failed to save avatar' }), { status: 500 });
	}
};
