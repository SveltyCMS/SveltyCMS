import type { Component } from 'svelte';
import Tool from './Tool.svelte';
import Controls from './Controls.svelte';

export default {
	key: 'watermark',
	title: 'Watermark',
	icon: 'mdi:sticker',
	tool: Tool as unknown as Component<Record<string, unknown>>,
	controls: Controls as unknown as Component<Record<string, unknown>>
};
