import type Konva from 'konva';

export interface ZoomProps {
	stage: Konva.Stage;
	layer: Konva.Layer;
	imageNode: Konva.Image;
	imageGroup?: Konva.Group;
	onZoomApplied?: () => void;
	onZoomCancelled?: () => void;
}
