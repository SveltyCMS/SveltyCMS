import { PUBLIC_MEDIA_FOLDER } from '$env/static/public';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { redirect } from '@sveltejs/kit';
import { auth } from '../../api/db';
import { validate } from '@src/utils/utils';
import { DEFAULT_SESSION_COOKIE_NAME } from 'lucia';
import { roles } from '@src/collections/types';

// Only display if user is allowed to access
function hasFilePermission(user: any, file: string): boolean {
	const { role, username } = user;
	if (role === roles.admin) {
		return true;
	} else if (role === 'member' && file.startsWith(username)) {
		return true;
	}
	return false;
}

export async function load(event: any) {
	// Secure this page with session cookie
	const session = event.cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;
	// Validate the user's session
	const user = await validate(auth, session);
	// If validation fails, redirect the user to the login page
	if (user.status !== 200) {
		throw redirect(302, `/login`);
	}

	const mediaDir = path.resolve(PUBLIC_MEDIA_FOLDER);
	//Create the media folder if it doesn't exist
	if (!fs.existsSync(mediaDir)) {
		fs.mkdirSync(mediaDir);
		console.log(`Created media folder at ${mediaDir}`);
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
			const filePath = `${PUBLIC_MEDIA_FOLDER}/${file}`;
			const fileName = path.basename(file);

			const hash = fileName.split('-')[0];

			const thumbnail = `${PUBLIC_MEDIA_FOLDER}/${file}`;
			const size = await getFileSize(filePath);
			const hasPermission = hasFilePermission(user, file); // Check permission

			// Check if this image has the same hash as a previously seen image
			if (thumbnailImages.has(hash)) {
				return null; // Skip if a thumbnail for this hash already found
			} else {
				thumbnailImages.set(hash, true); // Store this hash to prevent duplicates
			}

			return {
				name: fileName,
				path: path.dirname(file),
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
			const filePath = path.join(PUBLIC_MEDIA_FOLDER, file);
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
				// TODO: replace with first page pdfthumbail
				// You could use a PDF library to generate a thumbnail for PDF files
				thumbnail = 'vscode-icons:file-type-pdf2';
			} else if (fileExt === '.svg') {
				const svgContent = await fsPromises.readFile(filePath, 'utf-8');
				thumbnail = svgContent;
			}

			const parts = fileName.split('-');
			const hash = parts[0];
			const hasPermission = hasFilePermission(user, file); // Check permission

			return {
				name: fileName,
				path: path.dirname(file),
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
			files.push(path.relative(PUBLIC_MEDIA_FOLDER, res));
		}
	}
	return files;
}

async function getFileSize(filePath: string): Promise<number> {
	const fileStats = await fsPromises.stat(filePath);
	return fileStats.size;
}

function getOfficeDocumentProperties(filePath: string): any {
	// Get the file properties using the appropriate library (e.g., Office for Mac, LibreOffice)
	return {};
}
