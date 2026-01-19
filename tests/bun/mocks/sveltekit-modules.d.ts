
// Mock SvelteKit modules
declare module '$app/environment' {
    export const browser: boolean;
    export const dev: boolean;
    export const building: boolean;
    export const version: string;
}

declare module '$app/navigation' {
    export function goto(url: string, opts?: any): Promise<void>;
    export function invalidate(url: string): Promise<void>;
    export function invalidateAll(): Promise<void>;
    export function preloadData(url: string): Promise<void>;
    export function preloadCode(url: string): Promise<void>;
    export function beforeNavigate(callback: (navigation: any) => void): void;
    export function afterNavigate(callback: (navigation: any) => void): void;
}

declare module '$app/stores' {
    export const getStores: () => any;
    export const page: any;
    export const navigating: any;
    export const updated: any;
}

