import type mongoose from 'mongoose';
import type { SIZES } from './utils';

// Media Image
export type MediaImage = {
	hash: string;
	_id: mongoose.Types.ObjectId;
	used_by: mongoose.Types.ObjectId[];
	type: 'Image';
} & Record<
	keyof typeof SIZES,
	{
		name: string;
		url: string;
		size: number;
		width: number;
		height: number;
		lastModified: Date;
	}
>;

// Media Document
export type MediaDocument = {
	hash: string;
	_id: mongoose.Types.ObjectId;
	used_by: mongoose.Types.ObjectId[];
	type: 'Document';
	name: string;
	size: number;
	lastModified: Date;
};

// Media Audio
export type MediaAudio = {
	hash: string;
	_id: mongoose.Types.ObjectId;
	used_by: mongoose.Types.ObjectId[];
	type: 'Audio';
	name: string;
	size: number;
	duration: number;
	lastModified: Date;
};

// Media Video
export type MediaVideo = {
	hash: string;
	_id: mongoose.Types.ObjectId;
	used_by: mongoose.Types.ObjectId[];
	type: 'Video';
	name: string;
	size: number;
	duration: number;
	lastModified: Date;
};

// Media Remote Video
export type MediaRemoteVideo = {
	hash: string;
	_id: mongoose.Types.ObjectId;
	used_by: mongoose.Types.ObjectId[];
	type: 'RemoteVideo';
	name: string;
	url: string;
	lastModified: Date;
};

// Union type for all media types
export type Media = MediaImage | MediaDocument | MediaAudio | MediaVideo | MediaRemoteVideo;
