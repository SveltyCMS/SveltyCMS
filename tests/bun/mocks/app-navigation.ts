/**
 * Mock for $app/navigation
 */
export async function goto(url: string, opts?: any): Promise<void> {}
export async function invalidate(url: string | ((url: URL) => boolean)): Promise<void> {}
export async function invalidateAll(): Promise<void> {}
export async function preloadData(url: string): Promise<void> {}
export async function preloadCode(...urls: string[]): Promise<void> {}
export function beforeNavigate(fn: any): void {}
export function afterNavigate(fn: any): void {}
export function onNavigate(fn: any): () => void {
	return () => {};
}
export function disableScrollHandling(): void {}
export function pushState(url: string | URL, state: any): void {}
export function replaceState(url: string | URL, state: any): void {}
