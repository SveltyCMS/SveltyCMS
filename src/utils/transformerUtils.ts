import Konva from 'konva';

/**
 * Attaches consistent styling to a Konva Transformer
 * @param transformer The transformer instance
 * @param node Optional node to attach to immediately
 */
export function attachStyledTransformer(transformer: Konva.Transformer, node?: Konva.Node) {
	transformer.setAttrs({
		anchorFill: '#3b82f6', // primary-500
		anchorStroke: '#ffffff',
		anchorStrokeWidth: 2,
		anchorSize: 10, // slightly smaller for elegance
		anchorCornerRadius: 5,
		borderStroke: '#3b82f6',
		borderStrokeWidth: 1.5,
		borderDash: [], // solid line
		rotateEnabled: true,
		rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
		rotateAnchorOffset: 20,
		enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
		keepRatio: true, // Default to keeping ratio for many things, can be overridden
		ignoreStroke: true
	});

	if (node) {
		transformer.nodes([node]);
	}
}
