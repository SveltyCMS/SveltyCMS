/**
 * @file src/routes/(app)/imageEditor/widgets/Crop/index.ts
 * @description Crop tool for Konva
 *
 * Features:
 * - Crop
 * - Namespacing events to avoid conflicts with other tools
 */
import type { Component } from 'svelte';
import Tool from './Tool.svelte';

export default {
	key: 'crop',
	title: 'Crop',
	icon: 'mdi:crop',
	tool: Tool as unknown as Component<Record<string, unknown>>
};
