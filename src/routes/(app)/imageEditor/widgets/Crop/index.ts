import type { Component } from 'svelte';
import Tool from './Tool.svelte';
import Controls from './Controls.svelte';

export default {
	key: 'crop',
	title: 'Crop',
	icon: 'mdi:crop',
	tool: Tool as unknown as Component<Record<string, unknown>>,
	controls: Controls as unknown as Component<Record<string, unknown>>
};
