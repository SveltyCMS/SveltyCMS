export type AnnotationType = 'rect' | 'circle' | 'text' | 'arrow' | 'line';

export interface Annotation {
	type: AnnotationType;
	x: number;
	y: number;
	width?: number;
	height?: number;
	radius?: number;
	text?: string;
	fontSize?: number;
	stroke: string;
	fill: string;
	strokeWidth?: number;
}
