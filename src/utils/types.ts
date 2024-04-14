import type { SIZES } from './utils';

export type ImageFiles = Record<
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
