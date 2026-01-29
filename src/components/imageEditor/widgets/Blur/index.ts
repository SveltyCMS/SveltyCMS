/**
 * @file src/components/imageEditor/widgets/Blur/index.ts
 * @description Blur/Pixelate tool for selective image redaction
 */
import type { Component } from 'svelte';
import Tool from './Tool.svelte';

export default {
	key: 'blur',
	title: 'Blur',
	icon: 'mdi:blur',
	description: 'Blur or pixelate regions of the image',
	category: 'privacy',
	order: 30,
	tool: Tool as unknown as Component<Record<string, unknown>>
};
