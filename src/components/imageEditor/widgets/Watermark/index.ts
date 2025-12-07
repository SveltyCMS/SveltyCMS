/**
 * @file src/routes/(app)/imageEditor/widgets/Watermark/index.ts
 * @description Registers the Watermark tool and its controls.
 *
 * Features:
 * - Registers the Watermark tool and its controls.
 */
import type { Component } from 'svelte';
import Tool from './Tool.svelte';

export default {
	key: 'watermark',
	title: 'Watermark',
	icon: 'mdi:copyright',
	tool: Tool as unknown as Component<Record<string, unknown>>
};
