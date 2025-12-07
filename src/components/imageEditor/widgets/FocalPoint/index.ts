/**
 * @file src/components/imageEditor/widgets/FocalPoint/index.ts
 * @description FocalPoint widget registration
 */

import type { WidgetDefinition } from '../registry';

export const FocalPointWidget: WidgetDefinition = {
	key: 'focalpoint',
	title: 'Focal Point',
	icon: 'mdi:focus-field',
	description: 'Set focal point with rule of thirds',
	tool: () => import('./Tool.svelte'),
	controls: null
};
