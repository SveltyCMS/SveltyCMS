/**
 * @file src/routes/(app)/imageEditor/widgets/Annotate/editText.ts
 * @description Text editor for Konva.Text nodes
 *
 * Features:
 * - HTML textarea overlay
 * - Accounts for stage position and page scroll
 * - Maintains Konva.Text properties
 * - Responsive to user input
 * - Clean up on completion
 */

import type Konva from 'konva';

/**
 * Create an HTML textarea over stage for editing Konva.Text.
 * This correctly accounts for stage position and page scroll.
 */
export function enableTextEdit(stage: Konva.Stage, textNode: Konva.Text, onComplete: (txt: string) => void) {
	// Get stage container's position relative to viewport
	const stageBox = stage.container().getBoundingClientRect();

	// Get text node's position relative to stage
	const textPosition = textNode.absolutePosition();

	// Get current page scroll
	const scrollX = window.scrollX;
	const scrollY = window.scrollY;

	const area = document.createElement('textarea');
	document.body.appendChild(area);

	area.value = textNode.text();
	area.style.position = 'absolute';

	// ** FIX: Add scroll offsets **
	area.style.top = `${stageBox.top + textPosition.y + scrollY}px`;
	area.style.left = `${stageBox.left + textPosition.x + scrollX}px`;

	// Apply styles from Konva node
	area.style.width = `${textNode.width()}px`;
	area.style.height = `${textNode.height() + 10}px`; // Add padding
	area.style.fontSize = `${textNode.fontSize()}px`;
	area.style.fontFamily = String(textNode.fontFamily()) || 'Arial';
	area.style.color = String(textNode.fill()) || '#000';
	area.style.lineHeight = String(textNode.lineHeight());
	area.style.padding = textNode.padding() + 'px';

	// General styles
	area.style.background = 'white';
	area.style.border = '1px solid #0066ff';
	area.style.boxShadow = '0 0 5px rgba(0,0,0,0.2)';
	area.style.margin = '0';
	area.style.resize = 'none';
	area.style.overflow = 'hidden';
	area.style.zIndex = '10000';

	area.focus();
	area.select();

	function done() {
		onComplete(area.value);
		document.body.removeChild(area);
		window.removeEventListener('keydown', handleKey);
		area.removeEventListener('blur', done);
	}

	function handleKey(e: KeyboardEvent) {
		// Finish on Escape
		if (e.key === 'Escape') {
			done();
		}
		// Finish on Enter (without Shift)
		if (e.key === 'Enter' && !e.shiftKey) {
			done();
		}
	}

	window.addEventListener('keydown', handleKey);
	area.addEventListener('blur', done);
}
