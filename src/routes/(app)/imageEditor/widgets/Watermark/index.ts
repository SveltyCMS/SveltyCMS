// @file: src/routes/(app)/imageEditor/widgets/Watermark/index.ts
// One-line: Registers the Watermark tool and its controls.

import type { Component } from 'svelte';
import Tool from './Tool.svelte';
import Controls from './Controls.svelte';

export default {
	key: 'watermark',
	title: 'Watermark',
	icon: 'mdi:copyright',
	tool: Tool as unknown as Component<Record<img, unknown>>,
	controls: Controls as unknown as Component<Record<string, unknown>>
};
