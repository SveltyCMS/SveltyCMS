/**
 * @file src/components/system/grid/types.ts
 * @description This file contains the types for the grid component.
 */


import type { Snippet } from 'svelte';

export interface GridItem {
    id: string;
    name: string;
    span?: number;
    heightSpan?: number;
    component?: Snippet;
    props?: Record<string, unknown>;
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