<!--
@file tests/unit/components/dom/mocks/mock-workflow-actions.svelte
@component
Test stub for `workflow-actions.svelte`: the real component fetches the workflow
definition on mount, which the editor tests do not exercise (and jsdom cannot
resolve a relative `/api` URL).

@props — collectionId / entryId are accepted and ignored.
-->

<div data-testid="workflow-actions-stub"></div>
