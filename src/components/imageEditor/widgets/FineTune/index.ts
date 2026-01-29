/**
 * @file src/routes/(app)/imageEditor/widgets/FineTune/index.ts
 * @description Registers the FineTune tool and its controls.
 *
 * @file src/components/imageEditor/widgets/FineTune/index.ts
 * @description Professional-grade color and tone adjustments
 */
import type { Component } from 'svelte';
import Tool from './Tool.svelte';

export default {
	key: 'finetune',
	title: 'Fine-Tune',
	icon: 'mdi:tune',
	description: 'Adjust brightness, contrast, color, and tone',
	category: 'adjust',
	order: 20,
	requiresImage: true,
	tool: Tool as unknown as Component<Record<string, unknown>>
};
