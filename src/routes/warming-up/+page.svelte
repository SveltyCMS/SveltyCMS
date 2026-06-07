<!--
@file src/routes/warming-up/+page.svelte
@component WarmingUp – Cold start loading screen shown while SveltyCMS initializes

Features:
- SSR-rendered (no JS required for initial render)
- Animated pulse indicator with "SveltyCMS is warming up..." message
- Real-time service status indicators (Database, Auth, Cache, Content)
- Polls /api/health every 1 second for updates
- Auto-redirects to originally requested URL when system is ready
- Elapsed time counter since page load
- Full dark mode support via Tailwind v4
- Follows existing empty-state design patterns
- Accessible: ARIA live regions for status updates
-->

<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import SveltyCMSLogo from '../../components/system/icons/svelty-cms-logo.svelte';

  // ── Runes ──────────────────────────────────────────────
  let services = $state<Record<string, { status: string; message: string }>>({
    database: { status: "initializing", message: "Connecting..." },
    auth: { status: "initializing", message: "Initializing..." },
    cache: { status: "initializing", message: "Warming..." },
    content: { status: "initializing", message: "Loading..." },
  });

  let overallState = $state<string>("INITIALIZING");
  let elapsedSeconds = $state(0);
  let pollError = $state<string | null>(null);
  let redirectUrl = $state<string>("/");

  // ── Derived ───────────────────────────────────────────
  const readyStates = ["READY", "WARMING", "WARMED", "DEGRADED"];
  let isReady = $derived(readyStates.includes(overallState));

  // ── Effects ───────────────────────────────────────────
  let elapsedTimer: ReturnType<typeof setInterval> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    // Extract redirect URL from query params
    const params = new URLSearchParams(window.location.search);
    redirectUrl = params.get("redirect") || "/";

    // Start elapsed time counter
    const startTime = Date.now();
    elapsedTimer = setInterval(() => {
      elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
    }, 200);

    // Start health polling
    pollHealth();

    pollTimer = setInterval(pollHealth, 1000);

    return () => {
      if (elapsedTimer) clearInterval(elapsedTimer);
      if (pollTimer) clearInterval(pollTimer);
    };
  });

  // ── Health Polling ───────────────────────────────────
  async function pollHealth() {
    try {
      const response = await fetch("/api/health");
      if (!response.ok) {
        pollError = `Health check failed: ${response.status}`;
        return;
      }

      const json = await response.json();
      if (json.success && json.data) {
        const data = json.data;
        overallState = data.state || overallState;
        if (data.services) {
          services = { ...services, ...data.services };
        }
        pollError = null;

        // Auto-redirect when ready
        if (readyStates.includes(overallState)) {
          if (pollTimer) clearInterval(pollTimer);
          if (elapsedTimer) clearInterval(elapsedTimer);

          // Small delay to let the UI show the ready state briefly
          setTimeout(() => {
            goto(redirectUrl, { replaceState: true });
          }, 600);
        }
      }
    } catch (err: any) {
      pollError = err?.message || "Failed to reach health endpoint";
    }
  }

  // ── Helpers ──────────────────────────────────────────
  function formatTime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }

  function statusClass(status: string): string {
    switch (status) {
      case "healthy":
        return "bg-green-500";
      case "initializing":
        return "bg-amber-400 animate-pulse";
      case "unhealthy":
        return "bg-red-500";
      case "skipped":
        return "bg-gray-400";
      default:
        return "bg-gray-500";
    }
  }

  function statusLabel(status: string): string {
    switch (status) {
      case "healthy": return "Ready";
      case "initializing": return "Initializing";
      case "unhealthy": return "Error";
      case "skipped": return "Skipped";
      default: return status;
    }
  }
</script>

<svelte:head>
  <title>SveltyCMS – Warming Up</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div
  class="flex min-h-screen flex-col items-center justify-center bg-gray-950/50 px-4 backdrop-blur-sm"
  role="status"
  aria-live="polite"
  aria-label="System warming up"
>
  <!-- Logo + Typography -->
  <div class="mb-8 flex flex-col items-center justify-center space-y-3">
    <!-- Top text -->
    <p class="text-sm font-medium uppercase tracking-wide text-surface-900 dark:text-white">
      {#if isReady}
        System ready — redirecting...
      {:else}
        SveltyCMS is warming up
      {/if}
    </p>

    <!-- Logo with animation -->
    <div class="flex items-center justify-center {isReady ? '' : 'animate-pulse'}" aria-hidden="true">
      <SveltyCMSLogo className="w-20 p-1" fill="red" />
    </div>

    <!-- Bottom text -->
    <p class="text-xs uppercase text-surface-700 dark:text-surface-300">
      {#if isReady}
        Redirecting to dashboard
      {:else}
        System services are starting
      {/if}
    </p>

    <!-- Elapsed Time -->
    <p class="text-xs text-surface-500 dark:text-surface-500" aria-live="polite">
      Elapsed: {formatTime(elapsedSeconds)}
    </p>
  </div>

  <!-- Rotating loader rings (only while warming) -->
  {#if !isReady}
    <div class="loader loader-1" aria-hidden="true"></div>
    <div class="loader loader-2" aria-hidden="true"></div>
    <div class="loader loader-3" aria-hidden="true"></div>
    <div class="loader loader-4" aria-hidden="true"></div>
  {/if}

  <!-- Service Status Indicators -->
  <div class="w-full max-w-md space-y-3" aria-label="Service status">
    <p class="text-xs font-medium uppercase tracking-wide text-surface-500 dark:text-surface-400">Service Status</p>
    {#each Object.entries(services) as [name, svc]}
      {@const displayName = name === "content" ? "Content System" : name.charAt(0).toUpperCase() + name.slice(1)}
      <div
        class="flex items-center gap-3 rounded-lg border border-surface-200 bg-white/90 p-4 shadow-sm transition-colors backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/90"
      >
        <!-- Status dot -->
        <span
          class="inline-block h-3 w-3 rounded-full {statusClass(svc.status)}"
          aria-hidden="true"
        ></span>

        <!-- Service name & status -->
        <div class="flex flex-1 items-center justify-between">
          <span class="text-sm font-medium text-surface-700 dark:text-gray-200">
            {displayName}
          </span>
          <span
            class="text-xs font-semibold uppercase tracking-wide {svc.status === 'healthy'
              ? 'text-green-600 dark:text-green-400'
              : svc.status === 'unhealthy'
                ? 'text-red-600 dark:text-red-400'
                : 'text-amber-600 dark:text-amber-400'}"
          >
            {statusLabel(svc.status)}
          </span>
        </div>
      </div>
    {/each}
  </div>

  <!-- Error indicator -->
  {#if pollError}
    <div class="mt-6 max-w-md rounded-lg border border-red-200 bg-red-50 p-3 text-center dark:border-red-800 dark:bg-red-950" role="alert">
      <p class="text-sm text-red-600 dark:text-red-400">{pollError}</p>
    </div>
  {/if}

  <!-- Footer -->
  <p class="mt-12 text-xs text-surface-400 dark:text-gray-500">
    This page will automatically refresh when the system is ready.
  </p>
</div>

<style>
  /* Base loader styles */
  .loader {
    position: absolute;
    border-style: solid;
    border-right-color: transparent;
    border-left-color: transparent;
    border-radius: 50%;
    transform: translateZ(0); /* GPU acceleration */
    will-change: transform; /* GPU acceleration */
  }

  /* Individual loader animations */
  .loader-1 {
    width: 150px;
    height: 150px;
    border-color: var(--color-error-500);
    border-width: 7px;
    animation: rotate 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
  }

  .loader-2 {
    width: 170px;
    height: 170px;
    border-color: var(--color-success-400);
    border-width: 6px;
    animation: rotate-reverse 2s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
  }

  .loader-3 {
    width: 190px;
    height: 190px;
    border-color: var(--color-tertiary-400);
    border-width: 5px;
    animation: rotate 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
  }

  .loader-4 {
    width: 210px;
    height: 210px;
    border-color: var(--color-surface-400);
    border-width: 4px;
    animation: rotate-reverse 3s cubic-bezier(0.26, 1.36, 0.74, -0.29) infinite;
  }

  /* Rotation animations */
  @keyframes rotate {
    from {
      transform: translateZ(0) rotateZ(-360deg);
    }
    to {
      transform: translateZ(0) rotateZ(0deg);
    }
  }

  @keyframes rotate-reverse {
    from {
      transform: translateZ(0) rotateZ(360deg);
    }
    to {
      transform: translateZ(0) rotateZ(0deg);
    }
  }

  /* Respect reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .loader {
      animation: none !important;
    }
  }
</style>
