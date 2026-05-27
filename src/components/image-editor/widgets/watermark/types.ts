/**
 * @file src\components\image-editor\widgets\watermark\types.ts
 * @description Types for the watermark widget
 */

export interface WatermarkData {
	type: 'text' | 'image';
	text: string;
	imageUrl?: string;
	x: number;
	y: number;
	opacity?: number;
	fontSize?: number;
	color?: string;
}
