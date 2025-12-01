/**
 * @file src/routes/(app)/imageEditor/widgets/Annotate/draw.ts
 * @description Draw tools for Konva
 *
 * Features:
 * - Text
 * - Rectangle
 * - Circle
 * - Line
 * - Arrow
 */

import Konva from 'konva';

/** Create a Text node ready for editing */
export function createText(layer: Konva.Layer, x: number, y: number, text = 'Text', fontSize = 20, color = '#000') {
	const t = new Konva.Text({ x, y, text, fontSize, fontFamily: 'Arial', fill: color, draggable: true, name: 'annotation-text' });
	layer.add(t);
	return t;
}

/** Create rect */
export function createRect(layer: Konva.Layer, x: number, y: number, w = 0, h = 0, stroke = '#f00', fill = 'transparent', strokeWidth = 2) {
	const r = new Konva.Rect({ x, y, width: w, height: h, stroke, fill, strokeWidth, draggable: true, name: 'annotation-rect' });
	layer.add(r);
	return r;
}

/** Create circle */
export function createCircle(layer: Konva.Layer, x: number, y: number, radius = 0, stroke = '#f00', fill = 'transparent', strokeWidth = 2) {
	const c = new Konva.Circle({ x, y, radius, stroke, fill, strokeWidth, draggable: true, name: 'annotation-circle' });
	layer.add(c);
	return c;
}

/** Create line */
export function createLine(layer: Konva.Layer, points: number[], stroke = '#f00', strokeWidth = 2) {
	const l = new Konva.Line({ points, stroke, strokeWidth, lineCap: 'round', lineJoin: 'round', name: 'annotation-line', draggable: false });
	layer.add(l);
	return l;
}

/** Create arrow */
export function createArrow(layer: Konva.Layer, points: number[], stroke = '#f00', strokeWidth = 2) {
	const a = new Konva.Arrow({
		points,
		stroke,
		fill: stroke,
		strokeWidth,
		pointerLength: 10,
		pointerWidth: 8,
		name: 'annotation-arrow',
		draggable: false
	});
	layer.add(a);
	return a;
}
