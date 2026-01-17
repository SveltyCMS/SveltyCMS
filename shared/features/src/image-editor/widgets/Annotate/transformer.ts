/**
 * @file shared/features/src/image-editor/widgets/Annotate/transformer.ts
 * @description Transformer utilities for Annotate tool
 *
 * Re-exports shared transformer config for consistent styling across widgets.
 */
import Konva from 'konva';
import { createStyledTransformer, attachStyledTransformer } from '../transformerConfig';

/**
 * Create a transformer for annotations with consistent styling.
 * Uses more anchors than other tools for flexible annotation resizing.
 */
export function createTransformer(layer: Konva.Layer): Konva.Transformer {
	return createStyledTransformer(layer, {
		keepRatio: false,
		enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right']
	});
}

/**
 * Re-export attach function for convenience
 */
export const attachTransformer = attachStyledTransformer;
