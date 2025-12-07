/**
 * @file src/routes/(app)/imageEditor/widgets/FineTune/index.ts
 * @description Registers the FineTune tool and its controls.
 *
 * Features:
 * - Registers the FineTune tool and its controls.
 */
import type { Component } from 'svelte';
import Tool from './Tool.svelte';

export default {
	key: 'finetune',
	title: 'Fine-Tune',
	icon: 'mdi:tune',
	tool: Tool as unknown as Component<Record<string, unknown>>
};
