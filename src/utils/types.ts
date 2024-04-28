import type mongoose from 'mongoose';
import type { SIZES } from './utils';

// Media Image
export type MediaImage = { hash: string; _id: string; oldID?: string; used_by: mongoose.Types.ObjectId[] } & Record<
	keyof typeof SIZES,
	{
		name: string;
		url: string;
		size: number;
		type: string;
		width: number;
		height: number;
		lastModified: number;
	}
>;
