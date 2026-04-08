<!--
@file src/components/system/background-pattern.svelte
@component
**Optimized Animated SVG Background Pattern Component**
Performance-optimized version with reduced path count, hardware acceleration,
and configurable quality settings for weaker devices.

@example
<BackgroundPattern
    background="white"
    startDirection="TopLeft"
    endDirection="BottomRight"
    animationDirection="normal"
    quality="medium"
	autoDetectPerformance={true}
/>

### Props
- `background` {'white' | '#242728'}: Background color of the SVG container (default: 'white')
- `startDirection` {'TopLeft' | 'TopRight' | 'MiddleLeft' | 'MiddleRight' | 'BottomLeft' | 'BottomRight'}: Starting point of the paths (default: 'TopLeft')
- `endDirection` {'TopLeft' | 'TopRight' | 'MiddleLeft' | 'MiddleRight' | 'BottomLeft' | 'BottomRight'}: Ending point of the paths (default: 'BottomRight')
- `animationDirection` {'normal' | 'reverse'}: Direction of the animation (default: 'normal')

### Features
- Reduced path count for better performance
- Hardware acceleration with CSS transforms
- Configurable quality settings (low/medium/high)
- Automatic performance detection
- Reduced motion support
- Optimized animations with requestAnimationFrame
- Memory-efficient path generation
-->

<script lang="ts">
  import { cubicOut } from "svelte/easing";
  import { Tween } from "svelte/motion";
  import { browser } from "$app/environment";

  const {
    background = "white",
    startDirection = "TopLeft",
    endDirection = "BottomRight",
    animationDirection = "normal",
    quality = "medium",
    autoDetectPerformance = true,
  } = $props<{
    background?: "white" | "#242728";
    startDirection?:
      | "TopLeft"
      | "TopRight"
      | "MiddleLeft"
      | "MiddleRight"
      | "BottomLeft"
      | "BottomRight";
    endDirection?:
      | "TopLeft"
      | "TopRight"
      | "MiddleLeft"
      | "MiddleRight"
      | "BottomLeft"
      | "BottomRight";
    animationDirection?: "normal" | "reverse";
    quality?: "low" | "medium" | "high";
    autoDetectPerformance?: boolean;
  }>();

  // --- Performance & Configuration ---
  let detectedQuality = $state<"low" | "medium" | "high">("medium");

  // Automatically cascades settings without manual sync functions
  let effectiveQuality = $derived(
    autoDetectPerformance ? detectedQuality : quality,
  );
  let pathCount = $derived(
    effectiveQuality === "low" ? 6 : effectiveQuality === "high" ? 18 : 12,
  );
  let duration = $derived(
    effectiveQuality === "low"
      ? 6000
      : effectiveQuality === "high"
        ? 10000
        : 8000,
  );

  let shouldReduceMotion = $state(false);
  let isAnimating = $state(false);
  let isVisible = $state(true);
  let svgElement = $state<SVGElement>();

  const animationProgress = new Tween(0, { duration: 8000, easing: cubicOut });

  // Standard Map is faster than SvelteMap since we don't need it to trigger reactivity directly
  const pathCache = new Map<string, string>();

  function detectPerformance(): "low" | "medium" | "high" {
    if (!browser) return "medium";

    const connection = (navigator as any).connection;
    const memory = (performance as any).memory;
    const hardwareConcurrency = navigator.hardwareConcurrency || 4;

    let score = 0;
    if (hardwareConcurrency >= 8) score += 2;
    else if (hardwareConcurrency >= 4) score += 1;

    if (memory?.totalJSHeapSize) {
      if (memory.totalJSHeapSize > 100 * 1024 * 1024) score += 2;
      else if (memory.totalJSHeapSize > 50 * 1024 * 1024) score += 1;
    }

    if (connection?.effectiveType) {
      if (connection.effectiveType === "4g") score += 1;
      else if (connection.effectiveType === "3g") score -= 1;
      else if (connection.effectiveType === "2g") score -= 2;
    }

    if (/Mobile|Android|iPhone|iPad/.test(navigator.userAgent)) score -= 1;

    if (score >= 3) return "high";
    if (score >= 1) return "medium";
    return "low";
  }

  function generatePath(
    start: string,
    end: string,
    index: number,
    position: number,
  ): string {
    const cacheKey = `${start}-${end}-${index}-${position}`;
    if (pathCache.has(cacheKey)) return pathCache.get(cacheKey)!;

    const coords = {
      TopLeft: { x: -200, y: -100 },
      TopRight: { x: 896, y: -100 },
      MiddleLeft: { x: -200, y: 158 },
      MiddleRight: { x: 896, y: 158 },
      BottomLeft: { x: -200, y: 416 },
      BottomRight: { x: 896, y: 416 },
    };

    const startCoord = coords[start as keyof typeof coords];
    const endCoord = coords[end as keyof typeof coords];

    const startX = startCoord.x + index * 15 * position;
    const startY = startCoord.y + index * 8 * position;
    const endX = endCoord.x + index * 15 * position;
    const endY = endCoord.y + index * 8 * position;

    const path = `M${startX},${startY}Q${(startX + endX) / 2},${(startY + endY) / 2} ${endX},${endY}`;
    pathCache.set(cacheKey, path);
    return path;
  }

  const paths = $derived(
    Array.from({ length: pathCount }, (_, i) => {
      const baseOpacity = 0.15 + (i / pathCount) * 0.4;
      return {
        id: i,
        d: generatePath(startDirection, endDirection, i, i % 2 === 0 ? 1 : -1),
        width: 0.8 + i * 0.1,
        opacity: baseOpacity,
        color:
          background === "white"
            ? `rgba(15,23,42,${baseOpacity})`
            : `rgba(255,255,255,${baseOpacity})`,
      };
    }),
  );

  // --- Animation Loop ---
  async function animateLoop() {
    if (!isAnimating || shouldReduceMotion) return;

    // Use async/await instead of nested .then() blocks
    await animationProgress.set(1, { duration });
    if (!isAnimating) return; // Break if stopped mid-animation

    await animationProgress.set(0, { duration });

    if (isAnimating) {
      requestAnimationFrame(animateLoop);
    }
  }

  function getStrokeDashOffset(pathIndex: number): number {
    const progress = animationProgress.current;
    const staggerDelay = pathIndex * 0.1;
    const adjustedProgress = Math.max(0, Math.min(1, progress - staggerDelay));

    return animationDirection === "reverse"
      ? 1000 * adjustedProgress
      : 1000 * (1 - adjustedProgress);
  }

  // --- Effects (Lifecycle) ---
  $effect(() => {
    if (!browser) return;

    // Reactively listen for accessibility preference changes
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    shouldReduceMotion = mediaQuery.matches;

    const handler = (e: MediaQueryListEvent) => {
      shouldReduceMotion = e.matches;
    };
    mediaQuery.addEventListener("change", handler);

    if (autoDetectPerformance) {
      detectedQuality = detectPerformance();
    }

    return () => mediaQuery.removeEventListener("change", handler);
  });

  $effect(() => {
    if (!browser || !svgElement) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible && !shouldReduceMotion && !isAnimating) {
          isAnimating = true;
          animateLoop();
        } else if (!isVisible && isAnimating) {
          isAnimating = false; // Gracefully stops the async loop
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(svgElement);
    return () => observer.disconnect();
  });
</script>

<svg
  bind:this={svgElement}
  class="absolute inset-0 h-full w-full"
  viewBox="0 0 696 316"
  fill="none"
  aria-label="Background Pattern"
  role="presentation"
  aria-hidden="true"
  style:z-index="0"
  style:background-color={background}
  style:will-change="transform"
  style:transform="translateZ(0)"
>
  {#each paths as path (path.id)}
    <path
      d={path.d}
      stroke={path.color}
      stroke-width={path.width}
      stroke-linecap="round"
      stroke-opacity={path.opacity}
      style:stroke-dasharray="1000px"
      style:stroke-dashoffset="{getStrokeDashOffset(path.id)}px"
      style:will-change="stroke-dashoffset"
      aria-hidden="true"
    />
  {/each}
</svg>
