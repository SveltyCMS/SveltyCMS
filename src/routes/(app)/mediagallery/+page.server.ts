import { publicEnv } from '@root/config/public';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { redirect } from '@sveltejs/kit';

// Auth
import { auth } from '@api/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import type { User } from '@src/auth/types';

// Only display if user is allowed to access
function hasFilePermission(user: User, file: string): boolean {
	// allow admin role
	if (user.role === 'admin') {
		return true;
	}

	// Allow User that created content to access
	if (user.role === 'developer' && user.username && file.startsWith(user.username)) {
		return true;
	}

	// No permission
	return false;
}

export async function load(event: any) {
	// Secure this page with session cookie
	const session_id = event.cookies.get(SESSION_COOKIE_NAME) as string;
	// Validate the user's session
	const user = await auth.validateSession(session_id);

	// If validation fails, redirect the user to the login page
	if (!user) {
		redirect(302, `/login`);
		return;
	}

	const mediaDir = path.resolve(publicEnv.MEDIA_FOLDER);
	//Create the media folder if it doesn't exist
	if (!fs.existsSync(mediaDir)) {
		fs.mkdirSync(mediaDir);
		// console.log(`Created media folder at ${mediaDir}`);
	}

	const files = await getFilesRecursively(mediaDir);

	//Handle the case where the folder is empty
	if (files.length === 0) {
		return {
			props: {
				data: []
			}
		};
	}

	const imageExtensions = ['.jpeg', '.jpg', '.png', '.webp', '.avif', '.tiff', '.svg'];
	const uniqueImageFiles = Array.from(new Set(files.filter((file) => imageExtensions.includes(path.extname(file).toLowerCase()))));

	// If there are no image files, return an empty array
	if (uniqueImageFiles.length === 0) {
		return {
			props: {
				data: []
			}
		};
	}

	const thumbnailImages = new Map(); // Store thumbnails by hash

	const mediaData = await Promise.all(
		uniqueImageFiles.map(async (file) => {
			const mediaPath = `${publicEnv.MEDIA_FOLDER}/${file}`; // Get the full path to the image
			const mediaExt = path.extname(file).substring(1); // Get the extension
			const mediaName = `${path.basename(file).slice(0, -65)}.${mediaExt}`; // Remove last 64 characters (hash) from the file name // Get the name without hash
			const hash = path.basename(file).slice(-64).split('.')[0]; // Get the hash
			const onlyPath = mediaPath.substring(mediaPath.lastIndexOf('/') + 1, mediaPath.lastIndexOf('.') - 64);

			const thumbnail = `${publicEnv.MEDIA_FOLDER}/${file}`;
			const size = await getFileSize(mediaPath);
			const hasPermission = hasFilePermission(user, file); // Check permission
			// Check if this image has the same hash as a previously seen image
			if (thumbnailImages.has(hash)) {
				return null; // Skip if a thumbnail for this hash already found
			} else {
				thumbnailImages.set(hash, true); // Store this hash to prevent duplicates
			}

			return {
				name: mediaName,
				path: onlyPath,
				thumbnail,
				size,
				hash,
				hasPermission
			};
		})
	);

	const officeExtensions = ['.docx', '.xlsx', '.pptx', '.pdf', '.svg'];
	const officeDocuments = files.filter((file) => officeExtensions.includes(path.extname(file).toLowerCase()));

	const officeDocumentData = await Promise.all(
		officeDocuments.map(async (file) => {
			const filePath = path.join(publicEnv.MEDIA_FOLDER, file);
			const fileName = path.basename(file);
			const fileExt = path.extname(file).toLowerCase();

			let thumbnail = '';
			if (fileExt === '.docx') {
				thumbnail = 'vscode-icons:file-type-word';
			} else if (fileExt === '.xlsx') {
				thumbnail = 'vscode-icons:file-type-excel';
			} else if (fileExt === '.pptx') {
				thumbnail = 'vscode-icons:file-type-powerpoint';
			} else if (fileExt === '.pdf') {
				// TODO: replace with first page pdf thumbail
				// You could use a PDF library to generate a thumbnail for PDF files
				thumbnail = 'vscode-icons:file-type-pdf2';
			} else if (fileExt === '.svg') {
				const svgContent = await fsPromises.readFile(filePath, 'utf-8');
				thumbnail = svgContent;
			}

			const parts = fileName.split('.'); // Corrected this line
			const hash = parts[0];
			const hasPermission = hasFilePermission(user, file); // Check permission

			return {
				name: fileName,
				path: filePath,
				thumbnail,
				size: await getFileSize(filePath),
				hash,
				hasPermission
			};
		})
	);

	const filteredMediaData = mediaData.filter(Boolean);

	// console.log('filteredMediaData:', filteredMediaData);
	// console.log('officeDocumentData:', officeDocumentData);

	return {
		props: {
			data: [...filteredMediaData, ...officeDocumentData]
		}
	};
}

async function getFilesRecursively(dir: string): Promise<string[]> {
	let files: string[] = [];
	const dirents = await fsPromises.readdir(dir, { withFileTypes: true });
	for (const dirent of dirents) {
		const res = path.resolve(dir, dirent.name);
		if (dirent.isDirectory()) {
			files = [...files, ...(await getFilesRecursively(res))];
		} else {
			files.push(path.relative(publicEnv.MEDIA_FOLDER, res));
		}
	}
	return files;
}

async function getFileSize(filePath: string): Promise<number> {
	const fileStats = await fsPromises.stat(filePath);
	return fileStats.size;
}
