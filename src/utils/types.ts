import type { SIZES } from '@utils/utils';

// Generic ID type to replace specific ID creation
export type ID = string | number;

// Media Image
export type MediaImage = {
	hash: string;
	id: ID;
	used_by: ID[];
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
	id: ID;
	used_by: ID[];
	type: 'Document';
	name: string;
	size: number;
	lastModified: Date;
};

// Media Audio
export type MediaAudio = {
	hash: string;
	id: ID;
	used_by: ID[];
	type: 'Audio';
	name: string;
	size: number;
	duration: number;
	lastModified: Date;
};

// Media Video
export type MediaVideo = {
	hash: string;
	id: ID;
	used_by: ID[];
	type: 'Video';
	name: string;
	size: number;
	duration: number;
	lastModified: Date;
};

// Media Remote Video
export type MediaRemoteVideo = {
	hash: string;
	id: ID;
	used_by: ID[];
	type: 'RemoteVideo';
	name: string;
	url: string;
	lastModified: Date;
};

// Union type for all media types
export type Media = MediaImage | MediaDocument | MediaAudio | MediaVideo | MediaRemoteVideo;
