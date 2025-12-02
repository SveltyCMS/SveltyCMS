/**
 * @file src/routes/(app)/imageEditor/widgets/Annotate/regions.ts
 * @description Regions for Annotate tool
 *
 * Features:
 * - Text
 * - Rectangle
 * - Circle
 * - Line
 * - Arrow
 * - Text editing
 * - Namespacing events to avoid conflicts with other tools
 */
import Konva from 'konva';

export type AnnotationKind = 'text' | 'rect' | 'circle' | 'arrow' | 'line';

/**
 * AnnotationItem encapsulates one annotation (node) and provides lifecycle methods.
 */
export class AnnotationItem {
	id: string;
	node: Konva.Node;
	layer: Konva.Layer;
	kind: AnnotationKind;

	private _onSelect: (() => void) | null = null;
	private _onDestroy: (() => void) | null = null;

	constructor(id: string, node: Konva.Node, layer: Konva.Layer, kind: AnnotationKind) {
		this.id = id;
		this.node = node;
		this.layer = layer;
		this.kind = kind;

		// attach selection handler
		this.node.on('click tap', (e) => {
			e.cancelBubble = true;
			this._onSelect?.();
		});
	}

	// one-line: make node draggable and focusable
	enableInteraction() {
		(this.node as any).draggable(true);
	}

	// one-line: disable interaction
	disableInteraction() {
		(this.node as any).draggable(false);
	}

	// one-line: attach a generic event listener
	on(event: string, cb: Function) {
		this.node.on(event, cb as any);
	}

	// one-line: remove a generic event listener
	off(event: string) {
		this.node.off(event);
	}

	// one-line: destroy node and call destructor
	destroy() {
		try {
			this.node.destroy();
		} catch (e) {}
		this._onDestroy?.();
	}

	onSelect(cb: () => void) {
		this._onSelect = cb;
	}
	onDestroy(cb: () => void) {
		this._onDestroy = cb;
	}
}

export default AnnotationItem;
