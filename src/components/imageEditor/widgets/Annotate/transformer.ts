/**
 * @file src/routes/(app)/imageEditor/widgets/Annotate/transformer.ts
 * @description Transformer for Konva
 *
 * Features:
 * - Safe transformer with conservative defaults
 * - Attach transformer to node with robust error handling
 */
import Konva from 'konva';

/** Create a safe transformer with conservative defaults */
export function createTransformer(layer: Konva.Layer) {
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
export function attachTransformer(tr: Konva.Transformer, node?: Konva.Node | null) {
	try {
		if (!node) {
			tr.nodes([]);
			tr.hide();
			return;
		}
		tr.nodes([node]);
		tr.show();
		tr.forceUpdate();
		tr.moveToTop();
	} catch {
		try {
			tr.nodes([]);
			tr.hide();
		} catch {
			// ignore
		}
	}
}
