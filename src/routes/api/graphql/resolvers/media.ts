import mongoose from 'mongoose';

export function mediaTypeDefs() {
	return `
        type MediaImage {
            _id: String
            url: String
            #------------------------
            createdAt: String
            updatedAt: String
        }

        type MediaDocument {
            _id: String
            url: String
            #------------------------
            createdAt: String
            updatedAt: String
        }

        type MediaAudio {
            _id: String
            url: String
            #------------------------
            createdAt: String
            updatedAt: String
        }

        type MediaVideo {
            _id: String
            url: String
            #------------------------
            createdAt: String
            updatedAt: String
        }

        type MediaRemote {
            _id: String
            url: String
            #------------------------
            createdAt: String
            updatedAt: String
        }
    `;
}

export function mediaResolvers() {
	return {
		mediaImages: async () => {
			const mediaModel = mongoose.models['media_images'];
			return await mediaModel.find().lean();
		},
		mediaDocuments: async () => {
			const mediaModel = mongoose.models['media_documents'];
			return await mediaModel.find().lean();
		},
		mediaAudio: async () => {
			const mediaModel = mongoose.models['media_audio'];
			return await mediaModel.find().lean();
		},
		mediaVideos: async () => {
			const mediaModel = mongoose.models['media_videos'];
			return await mediaModel.find().lean();
		},
		mediaRemote: async () => {
			const mediaModel = mongoose.models['media_remote'];
			return await mediaModel.find().lean();
		}
	};
}
