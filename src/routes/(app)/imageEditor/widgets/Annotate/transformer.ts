// src/routes/(app)/imageEditor/widgets/Annotate/transformer.ts
import Konva from 'konva';
import type { Node, Layer } from 'konva';

/** Create a safe transformer with conservative defaults */
export function createTransformer(layer: Layer) {
	const tr = new Konva.Transformer({
		keepRatio: false,
		enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right'],
		rotateEnabled: true,
		anchorSize: 10,
		borderStroke: '#0066ff',
		borderStrokeWidth: 2,
		anchorFill: '#0066ff',
		anchorStroke: '#ffffff',
		boundBoxFunc: (oldBox, newBox) => {
			if (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5) return oldBox;
			return newBox;
		}
	});
	layer.add(tr);
	tr.hide();
	tr.moveToTop();
	return tr;
}

/** Attach transformer to node with robust error handling */
export function attachTransformer(tr: Konva.Transformer, node?: Node | null) {
	try {
		if (!node) {
			tr.nodes([]);
			tr.hide();
			return;
		}
		tr.nodes([node as any]);
		tr.show();
		tr.forceUpdate();
		tr.moveToTop();
	} catch (e) {
		try {
			tr.nodes([]);
			tr.hide();
		} catch (e) {}
	}
}
