/**
 * @file tests/unit/components/dom/fixtures/breadcrumb-items.svelte.ts
 * @description Reactive crumb items for the breadcrumb growth regression test.
 */

export const breadcrumbItems = $state<Array<{ label: string; href: string }>>([
  { label: "Media Root", href: "/mediagallery" },
]);

export function resetBreadcrumbItems(): void {
  breadcrumbItems.splice(0, breadcrumbItems.length, { label: "Media Root", href: "/mediagallery" });
}
