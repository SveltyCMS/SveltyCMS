/**
 * @file src/components/image-editor/widgets/Rotate/index.ts
 * @description Rotate and straighten tool with visual guides
 */
import type { Component } from 'svelte';
import Tool from './tool.svelte';

export default {
	key: 'rotate',
	title: 'Rotate',
	icon: 'mdi:rotate-right',
	description: 'Rotate, flip, and straighten your image',
	category: 'transform',
	order: 15,
	requiresImage: true,
	tool: Tool as unknown as Component<Record<string, unknown>>
};
