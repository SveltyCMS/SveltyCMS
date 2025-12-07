/**
 * @file src/routes/(app)/imageEditor/widgets/registry.ts
 * @description Dynamic widgets registry using import.meta.glob for discoverability
 *
 * Features:
 * - Dynamic widgets registry using import.meta.glob for discoverability
 */
import type { Component } from 'svelte';

export interface EditorWidget {
	key: string;
	title: string;
	icon?: string;
	tool: Component<Record<string, unknown>>;
	controls: Component<Record<string, unknown>>;
}

// Load all widgets declared under ./<Widget>/index.ts (PascalCase folders only)
const modules = import.meta.glob('./[A-Z]*/index.ts', { eager: true }) as Record<string, unknown>;

export const editorWidgets: EditorWidget[] = Object.values(modules)
	.map((m) => {
		const mod = m as { default?: EditorWidget; editorWidget?: EditorWidget };
		return mod.default ?? mod.editorWidget;
	})
	.filter((w): w is EditorWidget => !!w);
