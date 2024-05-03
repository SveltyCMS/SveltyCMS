import type { RequestHandler } from './$types';
import mongoose from 'mongoose';

export const GET: RequestHandler = async () => {
	try {
		// Set up Media collections if they don't already exist
		if (!mongoose.models['media_images']) {
			mongoose.model('media_images', new mongoose.Schema({}, { typeKey: '$type', strict: false, timestamps: true }));
		}
		if (!mongoose.models['media_documents']) {
			mongoose.model('media_documents', new mongoose.Schema({}, { typeKey: '$type', strict: false, timestamps: true }));
		}
		if (!mongoose.models['media_audio']) {
			mongoose.model('media_audio', new mongoose.Schema({}, { typeKey: '$type', strict: false, timestamps: true }));
		}
		if (!mongoose.models['media_videos']) {
			mongoose.model('media_videos', new mongoose.Schema({}, { typeKey: '$type', strict: false, timestamps: true }));
		}
		if (!mongoose.models['media_remote']) {
			mongoose.model('media_remote', new mongoose.Schema({}, { typeKey: '$type', strict: false, timestamps: true }));
		}

		const imageFiles = await mongoose.models['media_images'].find({});
		const documentFiles = await mongoose.models['media_documents'].find({});
		const audioFiles = await mongoose.models['media_audio'].find({});
		const videoFiles = await mongoose.models['media_videos'].find({});
		const remoteFiles = await mongoose.models['media_remote'].find({});

		const allFiles = [
			...imageFiles.map((file) => ({ ...file.toObject(), type: 'Image' })),
			...documentFiles.map((file) => ({ ...file.toObject(), type: 'Document' })),
			...audioFiles.map((file) => ({ ...file.toObject(), type: 'Audio' })),
			...videoFiles.map((file) => ({ ...file.toObject(), type: 'Video' })),
			...remoteFiles.map((file) => ({ ...file.toObject(), type: 'RemoteVideo' }))
		];

		return new Response(JSON.stringify(allFiles));
	} catch (error) {
		console.error('Error fetching media files:', error);
		return new Response('Error fetching media files', { status: 500 });
	}
};
