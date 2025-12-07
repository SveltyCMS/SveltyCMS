/**
 * @file src/routes/(app)/imageEditor/widgets/Annotate/index.ts
 * @description Annotate tool for Konva
 *
 * Features:
 * - Text
 * - Rectangle
 * - Circle
 * - Line
 * - Arrow
 * - Text editing
 * - Namespacing events to avoid conflicts with other tools
 */
import type { Component } from 'svelte';
import Tool from './Tool.svelte';

export default {
	key: 'annotate',
	title: 'Annotate',
	icon: 'mdi:draw',
	tool: Tool as unknown as Component<Record<string, unknown>>
};
