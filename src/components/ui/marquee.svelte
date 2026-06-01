<!--
@file src/components/ui/marquee.svelte
@component
**Native Marquee Component — High Performance Pure CSS Animation**

Provides a fluid horizontal or vertical marquee scrolling container with custom speed,
gap, and hover behaviors.

### Props
- `direction` ('left' | 'right' | 'up' | 'down'): Scrolling direction (default: 'left').
- `duration` (string): Speed duration of one scroll loop (e.g. '20s', '10s') (default: '30s').
- `pauseOnHover` (boolean): Pause the animation when mouse hovers (default: true).
- `gap` (string): Space between scrolling elements (e.g. '1rem', '24px') (default: '1rem').
- `class` (string): Additional custom container classes.
- `children` (Snippet): Marquee content.
-->

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '@utils/cn';

  interface Props {
    direction?: 'left' | 'right' | 'up' | 'down';
    duration?: string;
    pauseOnHover?: boolean;
    gap?: string;
    class?: string;
    children?: Snippet;
  }

  let {
    direction = 'left',
    duration = '30s',
    pauseOnHover = true,
    gap = '1rem',
    class: className,
    children,
    ...rest
  }: Props = $props();

  const isVertical = $derived(direction === 'up' || direction === 'down');
  const animationClass = $derived(`scroll-${direction}`);
</script>

<div
  class={cn(
    'marquee-container relative flex overflow-hidden select-none',
    isVertical ? 'flex-col h-full' : 'flex-row w-full',
    className
  )}
  style="--duration: {duration}; --gap: {gap};"
  role="marquee"
  {...rest}
>
  <div
    class={cn(
      'marquee-content shrink-0 flex justify-around',
      isVertical ? 'flex-col min-h-full' : 'flex-row min-w-full',
      animationClass,
      pauseOnHover && 'pause-on-hover'
    )}
  >
    {@render children?.()}
  </div>

  <!-- Duplicate element for seamless looping -->
  <div
    class={cn(
      'marquee-content shrink-0 flex justify-around',
      isVertical ? 'flex-col min-h-full' : 'flex-row min-w-full',
      animationClass,
      pauseOnHover && 'pause-on-hover'
    )}
    aria-hidden="true"
  >
    {@render children?.()}
  </div>
</div>

<style>
  .marquee-container {
    gap: var(--gap);
  }

  .marquee-content {
    gap: var(--gap);
  }

  .pause-on-hover:hover {
    animation-play-state: paused !important;
  }

  .scroll-left {
    animation: scroll-left var(--duration) linear infinite;
  }

  .scroll-right {
    animation: scroll-right var(--duration) linear infinite;
  }

  .scroll-up {
    animation: scroll-up var(--duration) linear infinite;
  }

  .scroll-down {
    animation: scroll-down var(--duration) linear infinite;
  }

  @keyframes scroll-left {
    0% {
      transform: translateX(0);
    }
    100% {
      transform: translateX(calc(-100% - var(--gap)));
    }
  }

  @keyframes scroll-right {
    0% {
      transform: translateX(calc(-100% - var(--gap)));
    }
    100% {
      transform: translateX(0);
    }
  }

  @keyframes scroll-up {
    0% {
      transform: translateY(0);
    }
    100% {
      transform: translateY(calc(-100% - var(--gap)));
    }
  }

  @keyframes scroll-down {
    0% {
      transform: translateY(calc(-100% - var(--gap)));
    }
    100% {
      transform: translateY(0);
    }
  }
</style>
