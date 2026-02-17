/**
 * @file src/components/imageEditor/widgets/Zoom/index.ts
 * @description Zoom widget registration for the Image Editor
 *
 * Features:
 * - Zoom in/out functionality
 * - Zoom slider control
 * - Fit to screen options
 * - Reset zoom
 */
import type { EditorWidget } from '../registry';
import Controls from './Controls.svelte';
import Tool from './Tool.svelte';

const widget: EditorWidget = {
	key: 'zoom',
	title: 'Zoom',
	icon: 'mdi:magnify-plus-outline',
	tool: Tool as unknown as import('svelte').Component<Record<string, unknown>>,
	controls: Controls as unknown as import('svelte').Component<Record<string, unknown>>
};

export const editorWidget = widget;
export default editorWidget;
