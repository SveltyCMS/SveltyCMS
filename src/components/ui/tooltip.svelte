<!-- 
 @src/routes/api/cms.ts src/components/ui/tooltip.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Tooltip Primitive
-->

<script lang="ts">
  import {
    computePosition,
    autoUpdate,
    offset,
    flip,
    shift,
    arrow,
  } from "@floating-ui/dom";
  import { cn } from "@utils/cn";
  import type { Snippet } from "svelte";
  import Portal from "./portal.svelte";

  interface Props {
    title?: string;
    positioning?: {
      placement?:
        | "top"
        | "top-start"
        | "top-end"
        | "bottom"
        | "bottom-start"
        | "bottom-end"
        | "left"
        | "left-start"
        | "left-end"
        | "right"
        | "right-start"
        | "right-end";
      gutter?: number;
    };
    class?: string;
    triggerClass?: string;
    content?: Snippet;
    children?: Snippet;
    [key: string]: any;
  }

  let {
    title = "",
    positioning = { placement: "top", gutter: 8 },
    class: className,
    triggerClass,
    content,
    children,
    ...rest
  }: Props = $props();

  let open = $state(false);
  let referenceEl = $state<HTMLElement | null>(null);
  let floatingEl = $state<HTMLElement | null>(null);
  let arrowEl = $state<HTMLElement | null>(null);

  let x = $state(0);
  let y = $state(0);
  let actualPlacement = $state<string>("top");
  let arrowX = $state<number | undefined>(0);
  let arrowY = $state<number | undefined>(0);

  const placement = $derived(positioning?.placement || "top");
  const gutter = $derived(positioning?.gutter ?? 8);
  let positionCalculated = $state(false);

  $effect(() => {
    if (open && referenceEl && floatingEl) {
      const cleanup = autoUpdate(referenceEl, floatingEl, async () => {
        const {
          x: nextX,
          y: nextY,
          placement: finalPlacement,
          middlewareData,
        } = await computePosition(referenceEl!, floatingEl!, {
          placement: placement,
          middleware: [
            offset(gutter),
            flip(),
            shift({ padding: 5 }),
            arrow({ element: arrowEl! }),
          ],
        });

        x = nextX;
        y = nextY;
        actualPlacement = finalPlacement;

        const { x: ax, y: ay } = middlewareData.arrow || {};
        arrowX = ax;
        arrowY = ay;

        // Mark as calculated to reveal the tooltip
        if (!positionCalculated) positionCalculated = true;
      });

      return cleanup;
    } else {
      // Reset when closing
      positionCalculated = false;
    }
  });

  const TOOLTIP_BASE =
    "z-[300] card px-2.5 py-1.5 text-xs font-medium shadow-xl absolute";
  const TOOLTIP_THEME =
    "bg-surface-900 dark:bg-white text-white dark:text-surface-900";

  const staticSide = $derived(
    {
      top: "bottom",
      right: "left",
      bottom: "top",
      left: "right",
    }[actualPlacement.split("-")[0]] as string,
  );

  function show() {
    open = true;
  }
  function hide() {
    open = false;
  }
</script>

<div
  bind:this={referenceEl}
  class={cn("inline-block", triggerClass)}
  onmouseenter={show}
  onmouseleave={hide}
  onfocus={show}
  onblur={hide}
  {...rest}
>
  {#if children}
    {@render children()}
  {/if}
</div>

{#if open}
  <Portal>
    <div
      bind:this={floatingEl}
      class={cn(
        TOOLTIP_BASE,
        TOOLTIP_THEME,
        "transition duration-150 animate-in fade-in zoom-in-95 scale-95",
        !positionCalculated ? "opacity-0" : "opacity-100",
        className,
      )}
      style="left: {x}px; top: {y}px;"
    >
      {#if content}
        {@render content()}
      {:else}
        <span>{title}</span>
      {/if}

      <!-- Arrow -->
      <div
        bind:this={arrowEl}
        class="absolute size-2 bg-surface-900 dark:bg-white rotate-45"
        style="
					left: {arrowX != null ? `${arrowX}px` : ''};
					top: {arrowY != null ? `${arrowY}px` : ''};
					{staticSide}: -4px;
				"
      ></div>
    </div>
  </Portal>
{/if}
