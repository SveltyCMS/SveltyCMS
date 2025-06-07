import type Konva from 'konva';

export interface WatermarkSettings {
	watermarkFile: File | null;
	position: WatermarkPosition;
	opacity: number;
	scale: number;
	offsetX: number;
	offsetY: number;
	rotation: number;
}

export interface WatermarkProps {
	stage: Konva.Stage;
	layer: Konva.Layer;
	imageNode: Konva.Image;
	onWatermarkChange?: (settings: WatermarkSettings) => void;
	onExitWatermark?: () => void;
}

export type WatermarkPosition =
	| 'top-left'
	| 'top-center'
	| 'top-right'
	| 'center-left'
	| 'center'
	| 'center-right'
	| 'bottom-left'
	| 'bottom-center'
	| 'bottom-right';
