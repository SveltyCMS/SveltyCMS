/**
 * @file src/components/imageEditor/widgets/transformerConfig.ts
 * @description Shared transformer configuration for consistent styling
 *
 * All image editor widgets (Crop, Blur, Annotate, Watermark) should use these
 * shared styles for uniform appearance of resize handles and borders.
 */
import Konva from 'konva';

/**
 * Unified transformer configuration
 * - Blue circular handles with white border
 * - Solid blue border around selection
 * - Consistent sizing across all widgets
 */
export const TRANSFORMER_STYLE_DEFAULT: Partial<Konva.TransformerConfig> = {
	// Handle appearance
	anchorFill: '#3b82f6', // Tailwind blue-500
	anchorStroke: '#ffffff',
	anchorStrokeWidth: 2,
	anchorSize: 12,
	anchorCornerRadius: 6, // Makes handles circular

	// Border appearance
	borderStroke: '#3b82f6',
	borderStrokeWidth: 2,
	borderDash: [] // Solid line
};

/**
 * Specialized style for Crop tool
 */
export const TRANSFORMER_STYLE_CROP: Partial<Konva.TransformerConfig> = {
	...TRANSFORMER_STYLE_DEFAULT,
	anchorFill: '#3b82f6',
	anchorStroke: '#ffffff',
	anchorSize: 14,
	anchorCornerRadius: 7, // Circular
	borderStroke: '#ffffff',
	borderStrokeWidth: 1.5
};

/**
 * Specialized style for Redact/Blur tool (White thin borders, blue handles)
 */
export const TRANSFORMER_STYLE_REDACT: Partial<Konva.TransformerConfig> = {
	...TRANSFORMER_STYLE_DEFAULT,
	borderStroke: '#ffffff',
	borderStrokeWidth: 1.5,
	anchorFill: '#3b82f6',
	anchorStroke: '#ffffff',
	anchorSize: 12,
	anchorCornerRadius: 6
};

/** Legacy alias to keep compatibility while transitioning */
export const TRANSFORMER_STYLE = TRANSFORMER_STYLE_DEFAULT;

/**
 * Style for rule-of-thirds grid
 */
export const GRID_STYLE = {
	stroke: 'rgba(255, 255, 255, 0.4)',
	strokeWidth: 1,
	listening: false
};

/**
 * Default transformer behavior options
 */
export const TRANSFORMER_DEFAULTS: Partial<Konva.TransformerConfig> = {
	keepRatio: true,
	rotateEnabled: true,
	rotationSnaps: [0, 90, 180, 270],
	rotateAnchorOffset: 40,
	enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
	boundBoxFunc: (oldBox, newBox) => {
		// Minimum size constraint
		if (newBox.width < 20 || newBox.height < 20) return oldBox;
		return newBox;
	}
};

/**
 * Creates a styled transformer with unified appearance.
 *
 * @param layer - Konva layer to add transformer to
 * @param options - Optional overrides for specific widget needs
 * @returns Configured Konva.Transformer
 *
 * @example
 * ```ts
 * const tr = createStyledTransformer(layer);
 * tr.nodes([myShape]);
 * ```
 */
export function createStyledTransformer(layer: Konva.Layer, options?: Partial<Konva.TransformerConfig>): Konva.Transformer {
	const tr = new Konva.Transformer({
		...TRANSFORMER_STYLE,
		...TRANSFORMER_DEFAULTS,
		...options
	});
	layer.add(tr);
	tr.moveToTop();
	return tr;
}

/**
 * Safely attaches transformer to a node with error handling.
 *
 * @param tr - Konva transformer instance
 * @param node - Node to attach, or null to detach
 */
export function attachStyledTransformer(tr: Konva.Transformer, node?: Konva.Node | null): void {
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
