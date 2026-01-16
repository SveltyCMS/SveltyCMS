/**
 * @file src/components/imageEditor/widgets/Rotate/index.ts
 * @description Rotate widget registration
 */
import type { EditorWidget } from '../registry';
import Tool from './Tool.svelte';
import Controls from '@src/components/imageEditor/toolbars/RotateControls.svelte';

const widget = {
	key: 'rotate',
	title: 'Rotate',
	icon: 'mdi:rotate-right',
	tool: Tool,
	controls: Controls
};

export const editorWidget = widget as unknown as EditorWidget;

export default editorWidget;
