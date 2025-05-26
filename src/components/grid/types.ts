import type { Snippet, SvelteComponent } from 'svelte';

export interface GridItem {
    id: string;
    name: string;
    span?: number;
    heightSpan?: number;
    component?: Snippet;
    props?: Record<string, any>;
}

export interface GridColumn {
    id: string;
    name: string;
    items: GridItem[];
    settings?: {
        minWidth?: string;
        maxWidth?: string;
        backgroundColor?: string;
        color?: string;
    };
}

export interface GridSettings {
    columns?: number;
    rows?: number;
    gap?: string;
    padding?: string;
    backgroundColor?: string;
} 