<!--
  @file src/components/ui/upgrade-prompt.svelte
  @component Marketplace upgrade prompt for licensed extensions (plugins/widgets).

  ### Props
  - `extensionId` (string): Marketplace extension id, e.g. `plugin:unified-data-hub`
  - `price` (string): Display price label, e.g. `€19.99`
  - `title` (string): Optional heading override
  - `message` (string): Optional body copy

  ### Features:
  - WCAG 2.2 AA accessible CTA
  - Marketplace deep link with extension id
-->
<script lang="ts">
  import Alert from '@components/ui/alert.svelte';
  import Button from '@components/ui/button.svelte';

  interface Props {
    extensionId: string;
    price?: string;
    title?: string;
    message?: string;
    class?: string;
  }

  const {
    extensionId,
    price = '',
    title = 'Upgrade required',
    message = 'This feature requires an active license or trial. Upgrade to unlock full access.',
    class: className = '',
  }: Props = $props();

  const marketplaceUrl = $derived(
    `https://marketplace.sveltycms.com/extensions/${encodeURIComponent(extensionId)}`,
  );
</script>

<div class={className} data-testid="upgrade-prompt">
  <Alert variant="warning" title={title}>
    <p class="text-sm">{message}</p>
    {#if price}
      <p class="mt-2 text-sm font-medium text-surface-700 dark:text-surface-200">{price}</p>
    {/if}
    <div class="mt-4">
      <Button
        variant="primary"
        href={marketplaceUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View license options on the marketplace"
        data-testid="upgrade-prompt-cta"
      >
        View license options
      </Button>
    </div>
  </Alert>
</div>