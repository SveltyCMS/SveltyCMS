import { PUBLIC_MEDIA_FOLDER, PUBLIC_MEDIA_OUTPUT_FORMAT } from '$env/static/public';
import type { RequestHandler } from '@sveltejs/kit';
import fs from 'fs';
import { auth } from '@src/routes/api/db';
import { sanitize } from '@src/utils/utils';
import sharp from 'sharp';
import crypto from 'crypto';

export const POST: RequestHandler = async ({ request }) => {
	const data = await request.formData();
	const avatar = data.get('avatar') as Blob;
	const userID = data.get('userID') as string;
	let url = '';

	if (avatar) {
		// Read the uploaded file as a buffer
		const buffer = Buffer.from(await avatar.arrayBuffer());

		const outputFormat = PUBLIC_MEDIA_OUTPUT_FORMAT || 'original';

		// Hash the file name using crypto
		const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 20);

		// Get the original filename without the extension
		const originalFileName = avatar.name.replace(/\.[^.]+$/, '');

		const originalExtension = avatar.name.split('.').slice(-1);

		// Sanitize the file name using your function
		const sanitizedFileName = sanitize(originalFileName);

		// Get the current avatar URL
		const user = await auth.getUser(userID);

		const oldAvatarURL = user.avatar;
		if (oldAvatarURL) {
			const oldFileName = oldAvatarURL.substring(oldAvatarURL.lastIndexOf('/') + 1);
			const oldFilePath = `${PUBLIC_MEDIA_FOLDER}/images/avatars/${oldFileName}`;
			if (fs.existsSync(oldFilePath)) {
				fs.unlinkSync(oldFilePath); // Delete the old file if it exists
			}
		}

		// Construct the final filename
		let fileName = `${hash}-${userID}-${sanitizedFileName}.${outputFormat}`;

		const outputPath = `${PUBLIC_MEDIA_FOLDER}/images/avatars`;

		if (!fs.existsSync(outputPath)) {
			fs.mkdirSync(outputPath, { recursive: true });
		}

		if (avatar.type === 'image/svg+xml') {
			// For SVG files or if outputFormat is 'original', keep the original filename and format
			fileName = `${hash}-${userID}-${sanitizedFileName}.svg`;
			fs.writeFileSync(`${outputPath}/${fileName}`, buffer);
		} else if (outputFormat === 'original') {
			fileName = `${hash}-${userID}-${sanitizedFileName}.${originalExtension}`;
			fs.writeFileSync(`${outputPath}/${fileName}`, buffer);
		} else {
			// Optimize the image using sharp
			const optimizedBuffer = await sharp(buffer)
				.rotate() // Automatically rotate
				.resize(400) // Resize to 400px
				.toFormat(outputFormat === 'webp' ? 'webp' : 'avif', {
					quality: outputFormat === 'webp' ? 80 : 50,
					progressive: true
				})
				.withMetadata() // Preserve original metadata
				.toBuffer(); // Get the optimized buffer

			fs.writeFileSync(`${outputPath}/${fileName}`, optimizedBuffer);
		}

		url = `/media/images/avatars/${fileName}`;
	}

	auth.updateUserAttributes(userID, {
		avatar: url
	});

	return new Response(JSON.stringify({ url }), { status: 200 });
};
