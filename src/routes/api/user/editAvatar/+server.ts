// Import dependencies
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { User } from '$lib/models/user-model';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Define a function to handle HTTP POST requests
export const POST: RequestHandler<Partial<Record<string, string>>, string | null> = async ({
	request,
	locals
}) => {
	// Extract form data from the request body
	const formData = await request.formData();

	// Check if the "dataurl" field is present in the form data
	if (!formData.has('dataurl')) {
		return json(
			{ message: 'No file provided' },
			{
				status: 400
			}
		);
	}

	// Validate user credentials and get user information from the session
	const user = locals.user;

	// Extract the base64-encoded image data from the "dataurl" field
	const dataUrl = formData.get('dataurl') as string;
	const parts = dataUrl.split(';');
	const mimType = parts[0].split(':')[1];
	const imageData = parts[1].split(',')[1];

	// Convert the base64-encoded image data to a buffer
	const buffer = Buffer.from(imageData, 'base64');

	// Check the file type
	const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
	if (!allowedTypes.includes(mimType)) {
		return json(
			{ message: 'File type not supported' },
			{
				status: 400
			}
		);
	}

	// Check the file size
	const allowedSize = 5 * 1024 * 1024; // 5 MB
	if (buffer.length > allowedSize) {
		return json(
			{ message: 'File size exceeds the limit' },
			{
				status: 400
			}
		);
	}

	// Resize the image to 200x200 pixels using the sharp library
	let b64data: string | Buffer | NodeJS.ArrayBufferView;
	try {
		b64data = await sharp(buffer).resize(200, 200).toFormat('webp').toBuffer();
	} catch (err) {
		return json(
			{ message: 'Could not resize image' },
			{
				status: 500
			}
		);
	}

	// base folder for saving user medias
	const basePath = 'media/avatar';

	// Check if the media folder exists and create it if it doesn't
	if (!fs.existsSync(basePath)) {
		fs.mkdirSync(basePath, { recursive: true });
	}

	if (!user || !user.userId) {
		return json(
			{ message: 'User not found' },
			{
				status: 404
			}
		);
	}

	const newPath = `${basePath}/${user?._id}_${new Date().getTime()}_avatar.webp`;

	// Get the current avatar path from the user object
	const currentAvatar = user.avatar;

	// Check if the media folder exists and create it if it doesn't
	if (!fs.existsSync(basePath)) {
		fs.mkdirSync(basePath, { recursive: true });
	}

	// Construct the trash folder path
	const trashPath = 'trash/media/avatar';

	// Check if the trash folder exists and create it if it doesn't
	if (!fs.existsSync(trashPath)) {
		fs.mkdirSync(trashPath, { recursive: true });
	}

	// Move the old avatar to the trash folder if it exists
	if (currentAvatar) {
		// Check if the trash folder exists and create it if it doesn't
		if (!fs.existsSync(trashPath)) {
			fs.mkdirSync(trashPath, { recursive: true });
		}

		fs.promises
			.rename(currentAvatar, `${trashPath}/${path.basename(currentAvatar)}`)
			.then(async () => {
				try {
					if (!fs.existsSync(basePath)) {
						fs.mkdirSync(basePath);
					}
					fs.writeFileSync(newPath, b64data);
				} catch (err) {
					console.log(err);
					return json(
						{ message: 'Error uploading image to directory' },
						{
							status: 500
						}
					);
				}
				// Update the user's avatar field in the MongoDB database
				await User.findOneAndUpdate(
					{
						_id: user?._id
					},
					{
						avatar: newPath
					}
				);

				return json(
					{ message: 'Uploaded avatar successfully', newPath },
					{
						status: 200
					}
				);
			})
			.catch((err) => {
				console.log(err);
				return json(
					{ message: 'Error moving old avatar to trash' },
					{
						status: 500
					}
				);
			});
	} else {
		try {
			if (!fs.existsSync(basePath)) {
				fs.mkdirSync(basePath);
			}
			fs.writeFileSync(newPath, b64data);
		} catch (err) {
			console.log(err);
			return json(
				{ message: 'Error uploading image to directory' },
				{
					status: 500
				}
			);
		}

		// Update the user's avatar field in the MongoDB database
		await User.findOneAndUpdate(
			{
				_id: user?._id
			},
			{
				avatar: newPath
			}
		);

		return json(
			{ message: 'Uploaded avatar successfully', newPath },
			{
				status: 200
			}
		);
	}
	// Add your logic to handle the POST request here
	return json({ message: 'POST request received' });
};
