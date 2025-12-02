/**
 * @file src/routes/(app)/imageEditor/widgets/Blur/index.ts
 * @description Blur tool for Konva
 *
 * Features:
 * - Blur
 * - Namespacing events to avoid conflicts with other tools
 */
import type { Component } from 'svelte';
import Tool from './Tool.svelte';
import Controls from './Controls.svelte';

export default {
	key: 'blur',
	title: 'Blur',
	icon: 'mdi:blur',
	tool: Tool as unknown as Component<Record<string, unknown>>,
	controls: Controls as unknown as Component<Record<string, unknown>>
};
