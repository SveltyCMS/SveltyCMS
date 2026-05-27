/**
 * @file src/components/image-editor/widgets/Watermark/index.ts
 * @description Professional watermark tool with text and image support
 */
import type { Component } from 'svelte';
import Tool from './tool.svelte';

export default {
	key: 'watermark',
	title: 'Watermark',
	icon: 'mdi:watermark',
	description: 'Add text or image watermarks to protect your content',
	category: 'annotate',
	order: 50,
	requiresImage: true,
	tool: Tool as unknown as Component<Record<string, unknown>>
};
