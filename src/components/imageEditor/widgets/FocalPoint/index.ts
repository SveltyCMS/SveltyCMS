/**
 * @file src/components/imageEditor/widgets/FocalPoint/index.ts
 * @description FocalPoint widget registration
 */

import type { EditorWidget } from '../registry';
import Tool from './Tool.svelte';

export const editorWidget: EditorWidget = {
	key: 'focalPoint',
	title: 'Focal Point',
	icon: 'mdi:target',

	tool: Tool as unknown as import('svelte').Component<Record<string, unknown>>,
	controls: null as unknown as import('svelte').Component<Record<string, unknown>>
};
