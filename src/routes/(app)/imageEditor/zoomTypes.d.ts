import type Konva from 'konva';

export interface ZoomProps {
	stage: Konva.Stage;
	layer: Konva.Layer;
	imageNode: Konva.Image;
	onZoomApplied?: () => void;
	onZoomCancelled?: () => void;
}
