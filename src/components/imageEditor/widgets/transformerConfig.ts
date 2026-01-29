/**
 * @file src/components/imageEditor/widgets/transformerConfig.ts
 * @description Unified transformer styling and utilities
 *
 * Provides consistent appearance and behavior for all transformer-based
 * widgets (Crop, Blur, Redact, Annotate, Watermark)
 */
import Konva from 'konva';

/**
 * Color palette for transformers
 * Can be extended to support theming
 */
export const TRANSFORMER_COLORS = {
	primary: '#3b82f6', // blue-500
	primaryDark: '#2563eb', // blue-600
	white: '#ffffff',
	black: '#000000',
	transparent: 'rgba(0, 0, 0, 0)',
	overlayLight: 'rgba(255, 255, 255, 0.4)',
	overlayDark: 'rgba(0, 0, 0, 0.5)'
} as const;

/**
 * Responsive anchor sizing based on viewport
 */
export function getAnchorSize(): number {
	if (typeof window === 'undefined') return 12;

	// Larger anchors for touch devices
	const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
	const viewportWidth = window.innerWidth;

	if (isTouchDevice || viewportWidth < 768) {
		return 16; // Larger for mobile
	}

	return 12; // Default for desktop
}

/**
 * Base transformer configuration
 */
export const TRANSFORMER_STYLE_BASE: Partial<Konva.TransformerConfig> = {
	// Handle appearance
	anchorFill: TRANSFORMER_COLORS.primary,
	anchorStroke: TRANSFORMER_COLORS.white,
	anchorStrokeWidth: 2,
	anchorSize: getAnchorSize(),
	anchorCornerRadius: getAnchorSize() / 2, // Circular

	// Border appearance
	borderStroke: TRANSFORMER_COLORS.primary,
	borderStrokeWidth: 2,
	borderDash: [],

	// Behavior
	rotateEnabled: true,
	rotationSnaps: [0, 90, 180, 270],
	rotateAnchorOffset: 40,

	// Padding for better touch targets
	padding: 5,

	// Animation
	anchorDragBoundFunc: function (_oldPos, newPos) {
		// Smooth dragging with momentum
		return newPos;
	}
};

/**
 * Default transformer (for general use)
 */
export const TRANSFORMER_STYLE_DEFAULT: Partial<Konva.TransformerConfig> = {
	...TRANSFORMER_STYLE_BASE
};

/**
 * Crop tool transformer (white borders, larger handles)
 */
export const TRANSFORMER_STYLE_CROP: Partial<Konva.TransformerConfig> = {
	...TRANSFORMER_STYLE_BASE,
	anchorFill: TRANSFORMER_COLORS.primary,
	anchorStroke: TRANSFORMER_COLORS.white,
	anchorSize: getAnchorSize() + 2,
	anchorCornerRadius: (getAnchorSize() + 2) / 2,
	borderStroke: TRANSFORMER_COLORS.white,
	borderStrokeWidth: 2,
	borderDash: [5, 5], // Dashed for crop
	keepRatio: false, // Allow free aspect ratio
	enabledAnchors: ['top-left', 'top-center', 'top-right', 'middle-right', 'middle-left', 'bottom-left', 'bottom-center', 'bottom-right']
};

/**
 * Redact/Blur tool transformer (subtle white borders)
 */
export const TRANSFORMER_STYLE_REDACT: Partial<Konva.TransformerConfig> = {
	...TRANSFORMER_STYLE_BASE,
	borderStroke: TRANSFORMER_COLORS.white,
	borderStrokeWidth: 1.5,
	borderDash: [4, 4],
	anchorFill: TRANSFORMER_COLORS.primary,
	anchorStroke: TRANSFORMER_COLORS.white,
	rotateEnabled: false // Typically no rotation needed
};

/**
 * Text/Annotation transformer (allows rotation)
 */
export const TRANSFORMER_STYLE_TEXT: Partial<Konva.TransformerConfig> = {
	...TRANSFORMER_STYLE_BASE,
	keepRatio: false,
	rotateEnabled: true,
	enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right']
};

/**
 * Shape/Watermark transformer (maintains aspect ratio)
 */
export const TRANSFORMER_STYLE_SHAPE: Partial<Konva.TransformerConfig> = {
	...TRANSFORMER_STYLE_BASE,
	keepRatio: true,
	rotateEnabled: true,
	enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right']
};

/** @deprecated Use TRANSFORMER_STYLE_DEFAULT */
export const TRANSFORMER_STYLE = TRANSFORMER_STYLE_DEFAULT;

/**
 * Grid styling for rule-of-thirds and guides
 */
export const GRID_STYLE = {
	stroke: TRANSFORMER_COLORS.overlayLight,
	strokeWidth: 1,
	dash: [5, 5] as number[],
	listening: false,
	opacity: 0.6
} as const;

/**
 * Overlay styling for dimmed areas (outside crop)
 */
export const OVERLAY_STYLE = {
	fill: TRANSFORMER_COLORS.overlayDark,
	listening: false,
	opacity: 0.5
} as const;

/**
 * Common transformer behavior defaults
 */
export const TRANSFORMER_DEFAULTS: Partial<Konva.TransformerConfig> = {
	keepRatio: true,
	rotateEnabled: true,
	rotationSnaps: [0, 90, 180, 270],
	rotateAnchorOffset: 40,
	enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],

	// Minimum size constraint
	boundBoxFunc: (oldBox, newBox) => {
		const minSize = getAnchorSize() * 2; // Minimum 2x anchor size

		if (newBox.width < minSize || newBox.height < minSize) {
			return oldBox;
		}

		return newBox;
	}
};

/**
 * Creates a styled transformer with unified appearance
 */
export function createStyledTransformer(
	layer: Konva.Layer,
	style: 'default' | 'crop' | 'redact' | 'text' | 'shape' = 'default',
	options?: Partial<Konva.TransformerConfig>
): Konva.Transformer {
	// Select style preset
	const stylePreset = {
		default: TRANSFORMER_STYLE_DEFAULT,
		crop: TRANSFORMER_STYLE_CROP,
		redact: TRANSFORMER_STYLE_REDACT,
		text: TRANSFORMER_STYLE_TEXT,
		shape: TRANSFORMER_STYLE_SHAPE
	}[style];

	const tr = new Konva.Transformer({
		...stylePreset,
		...TRANSFORMER_DEFAULTS,
		...options
	});

	layer.add(tr);
	tr.moveToTop();

	// Add accessibility label
	tr.setAttr('aria-label', 'Resize and rotate handle');

	return tr;
}

/**
 * Safely attaches transformer to a node
 */
export function attachStyledTransformer(tr: Konva.Transformer, node?: Konva.Node | null, animated = true): void {
	try {
		if (!node) {
			tr.nodes([]);

			if (animated) {
				tr.to({
					opacity: 0,
					duration: 0.15,
					onFinish: () => tr.hide()
				});
			} else {
				tr.hide();
			}
			return;
		}

		tr.nodes([node]);

		if (animated) {
			tr.opacity(0);
			tr.show();
			tr.to({
				opacity: 1,
				duration: 0.15
			});
		} else {
			tr.opacity(1);
			tr.show();
		}

		tr.forceUpdate();
		tr.moveToTop();
	} catch (error) {
		console.error('[Transformer] Failed to attach:', error);
		try {
			tr.nodes([]);
			tr.hide();
		} catch {
			// Silent fail
		}
	}
}

/**
 * Detaches transformer with animation
 */
export function detachStyledTransformer(tr: Konva.Transformer, animated = true): void {
	attachStyledTransformer(tr, null, animated);
}

/**
 * Updates transformer appearance (e.g., on theme change)
 */
export function updateTransformerTheme(tr: Konva.Transformer, darkMode = false): void {
	tr.setAttrs({
		anchorFill: TRANSFORMER_COLORS.primary,
		anchorStroke: TRANSFORMER_COLORS.white,
		borderStroke: darkMode ? TRANSFORMER_COLORS.white : TRANSFORMER_COLORS.primary
	});
	tr.forceUpdate();
}

/**
 * Creates a rule-of-thirds grid overlay
 */
export function createRuleOfThirdsGrid(layer: Konva.Layer, bounds: { x: number; y: number; width: number; height: number }): Konva.Group {
	const group = new Konva.Group({ listening: false });

	// Vertical lines
	for (let i = 1; i <= 2; i++) {
		const x = bounds.x + (bounds.width * i) / 3;
		const line = new Konva.Line({
			points: [x, bounds.y, x, bounds.y + bounds.height],
			...GRID_STYLE
		});
		group.add(line);
	}

	// Horizontal lines
	for (let i = 1; i <= 2; i++) {
		const y = bounds.y + (bounds.height * i) / 3;
		const line = new Konva.Line({
			points: [bounds.x, y, bounds.x + bounds.width, y],
			...GRID_STYLE
		});
		group.add(line);
	}

	layer.add(group);
	return group;
}

/**
 * Animates transformer appearance/disappearance
 */
export function animateTransformer(tr: Konva.Transformer, show: boolean, duration = 0.2): void {
	if (show) {
		tr.show();
		tr.to({
			opacity: 1,
			scaleX: 1,
			scaleY: 1,
			duration
		});
	} else {
		tr.to({
			opacity: 0,
			scaleX: 0.95,
			scaleY: 0.95,
			duration,
			onFinish: () => tr.hide()
		});
	}
}
