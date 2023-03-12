// Import dependencies
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import to from 'await-to-js';
import { User } from '$lib/models/user-model';
import sharp from 'sharp';
import fs from 'fs';

// Define a function to handle HTTP POST requests
export const POST: RequestHandler = async ({ request, locals }) => {
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

	//TODO add 2nd check for filesize and type

	// Check the file type
	// const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
	// if (!allowedTypes.includes(file.type)) {
	// 	return json(
	// 		{ message: 'File type not supported' },
	// 		{
	// 			status: 400
	// 		}
	// 	);
	// }

	// Check the file size
	// const allowedSize = 5 1024 1024; // 5 MB
	// if (file.size > allowedSize) {
	// return json(
	// { message: 'File size exceeds the limit' },
	// {
	// status: 400
	// }
	// );
	// }

	// Validate user credentials and get user information from the session
	const { user } = await locals.validateUser();

	// Extract the base64-encoded image data from the "dataurl" field
	const dataUrl = formData.get('dataurl') as string;
	const parts = dataUrl.split(';');
	const mimType = parts[0].split(':')[1];
	const imageData = parts[1].split(',')[1];

	// Convert the base64-encoded image data to a buffer
	const buffer = Buffer.from(imageData, 'base64');

	// Resize the image to 200x200 pixels using the sharp library

	const [err, b64data] = await to(sharp(buffer).resize(200, 200).toFormat('webp').toBuffer());
	if (err) {
		return json(
			{ message: 'Could not resize image' },
			{
				status: 500
			}
		);
	}

	// base folder for saving user medias
	let basePath = 'src/media';
	let path = `${basePath}/${user?.userId}_${new Date().getTime()}_avatar.webp`;

	try {
		if (!fs.existsSync(basePath)) {
			fs.mkdirSync(basePath);
		}
		let buff = Buffer.from(b64data, 'base64');
		fs.writeFileSync(path, buff);
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
			_id: user?.userId
		},
		{
			avatar: path
		}
	);

	// Return a JSON response with a success message and the URL of the resized image
	return json(
		{ message: 'Uploaded avatar successfully', path },
		{
			status: 200
		}
	);
};
