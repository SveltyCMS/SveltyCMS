/**
 * @file src/components/imageEditor/widgets/Rotate/index.ts
 * @description Rotate widget registration
 */
import type { EditorWidget } from '../registry';
import Tool from './Tool.svelte';
import Controls from '@src/components/imageEditor/toolbars/RotateControls.svelte';

export const editorWidget: EditorWidget = {
	key: 'rotate',
	title: 'Rotate',
	icon: 'mdi:rotate-right',
	tool: Tool,
	controls: Controls
};

export default editorWidget;
