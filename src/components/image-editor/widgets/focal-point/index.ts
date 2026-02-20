/**
 * @file src/components/image-editor/widgets/FocalPoint/index.ts
 * @description FocalPoint widget registration
 */

import type { EditorWidget } from '../registry';
import Tool from './tool.svelte';

export const editorWidget: EditorWidget = {
	key: 'focalpoint',
	title: 'Focal',
	icon: 'mdi:target',

	tool: Tool as unknown as import('svelte').Component<Record<string, unknown>>,
	controls: null as unknown as import('svelte').Component<Record<string, unknown>>
};
