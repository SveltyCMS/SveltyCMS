<!--
@file src/components/system/RestartRequiredBanner.svelte
@component
**Enhanced Restart Required Banner - Svelte 5 Optimized**

Displays a prominent banner when server restart is required with countdown and status.

@example
<RestartRequiredBanner />

### Features
- Prominent warning for configuration changes
- Server restart with confirmation
- Loading state during restart
- Countdown timer for auto-restart
- Toast notifications for success/error
- Dismissible with reminder option
- Full ARIA accessibility
- Keyboard navigation support
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { onDestroy, onMount } from 'svelte';
	import { fade, slide } from 'svelte/transition';

	// State
	let isRestarting = $state(false);
	let countdown = $state<number | null>(null);
	let isDismissed = $state(false);
	let countdownInterval: ReturnType<typeof setInterval> | null = null;
	let prefersReducedMotion = $state(false);

	// Auto-restart countdown (optional feature)
	const AUTO_RESTART_SECONDS = 30;

	// Restart server
	async function restartServer(skipConfirmation = false) {
		if (isRestarting) {
			return;
		}

		if (!skipConfirmation) {
			const confirmed = confirm('Are you sure you want to restart the server? This will temporarily interrupt service.');
			if (!confirmed) {
				return;
			}
		}

		isRestarting = true;

		try {
			const response = await fetch('/api/system/restart', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (response.ok) {
				toast.success('Server is restarting... Please wait.');

				// Optionally reload page after delay
				setTimeout(() => {
					window.location.reload();
				}, 5000);
			} else {
				const data = await response.json();
				throw new Error(data.error || 'Restart failed');
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to restart server';
			toast.error(message);
			isRestarting = false;
		}
	}

	// Start countdown
	function startCountdown() {
		countdown = AUTO_RESTART_SECONDS;

		countdownInterval = setInterval(() => {
			if (countdown! > 0) {
				countdown = countdown! - 1;
			} else {
				stopCountdown();
				restartServer(true);
			}
		}, 1000);
	}

	// Stop countdown
	function stopCountdown() {
		if (countdownInterval) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}
		countdown = null;
	}

	// Dismiss banner
	function dismiss() {
		stopCountdown();
		isDismissed = true;
	}

	// Lifecycle
	onMount(() => {
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		prefersReducedMotion = mediaQuery.matches;

		const handleChange = (e: MediaQueryListEvent) => {
			prefersReducedMotion = e.matches;
		};

		mediaQuery.addEventListener('change', handleChange);
		return () => mediaQuery.removeEventListener('change', handleChange);
	});

	onDestroy(() => {
		stopCountdown();
	});
</script>

{#if !isDismissed}
	<div
		class="variant-filled-warning relative overflow-hidden p-4 shadow-lg"
		role="alert"
		aria-live="assertive"
		aria-atomic="true"
		transition:slide={{ duration: prefersReducedMotion ? 0 : 300 }}
	>
		<!-- Background pattern (subtle) -->
		<div
			class="pointer-events-none absolute inset-0 opacity-10"
			style="background-image: repeating-linear-gradient(45deg, transparent, transparent 10px, currentColor 10px, currentColor 20px);"
			aria-hidden="true"
		></div>

		<!-- Content -->
		<div class="relative flex flex-col items-center gap-3 md:flex-row md:justify-between">
			<!-- Warning icon and message -->
			<div class="flex items-center gap-3 text-center md:text-start">
				<div class="shrink-0">
					<iconify-icon
						icon="mdi:alert-circle"
						width="32"
						class="text-warning-900 dark:text-warning-100 {!prefersReducedMotion ? 'animate-pulse' : ''}"
						aria-hidden="true"
					></iconify-icon>
				</div>

				<div>
					<p class="font-bold text-warning-900 dark:text-warning-100">Server Restart Required</p>
					<p class="mt-1 text-sm text-warning-800 dark:text-warning-200">Configuration changes need a server restart to take effect.</p>

					{#if countdown !== null}
						<p
							class="mt-2 text-sm font-semibold text-warning-900 dark:text-warning-100"
							transition:fade={{ duration: prefersReducedMotion ? 0 : 200 }}
						>
							Auto-restarting in {countdown} second{countdown !== 1 ? 's' : ''}...
						</p>
					{/if}
				</div>
			</div>

			<!-- Action buttons -->
			<div class="flex flex-wrap items-center gap-2">
				{#if countdown !== null}
					<!-- Cancel countdown -->
					<Button variant="outline" onclick={stopCountdown} disabled={isRestarting} size="sm">Cancel Auto-Restart</Button>
				{:else}
					<!-- Start countdown -->
					<Button variant="outline" onclick={startCountdown} disabled={isRestarting} size="sm">
						<iconify-icon icon="mdi:timer" width="18"></iconify-icon>
						Auto-Restart in {AUTO_RESTART_SECONDS}s
					</Button>
				{/if}

				<!-- Restart now -->
				<Button variant="error" onclick={() => restartServer(false)} disabled={isRestarting} aria-label="Restart server now" size="sm">
					{#if isRestarting}
						<div class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
						<span>Restarting...</span>
					{:else}
						<iconify-icon icon="mdi:restart" width="18"></iconify-icon>
						<span>Restart Now</span>
					{/if}
				</Button>

				<!-- Dismiss -->
				<Button variant="outline"
					onclick={dismiss}
					aria-label="Dismiss restart reminder"
					disabled={isRestarting}
					title="Dismiss (you can restart manually later)"
				 class="p-0! min-w-0">
					<iconify-icon icon="mdi:close" width="20"></iconify-icon>
				</Button>
			</div>
		</div>

		<!-- Progress bar for countdown -->
		{#if countdown !== null && countdown < AUTO_RESTART_SECONDS}
			<div class="absolute bottom-0 start-0 end-0 h-1 bg-warning-900/20" transition:fade={{ duration: prefersReducedMotion ? 0 : 200 }}>
				<div
					class="h-full bg-error-500 transition-all duration-1000 ease-linear"
					style="width: {((AUTO_RESTART_SECONDS - countdown) / AUTO_RESTART_SECONDS) * 100}%"
					role="progressbar"
					aria-valuenow={AUTO_RESTART_SECONDS - countdown}
					aria-valuemin={0}
					aria-valuemax={AUTO_RESTART_SECONDS}
					aria-label="Auto-restart countdown"
				></div>
			</div>
		{/if}

		<!-- Screen reader announcement -->
		<div class="sr-only" role="status" aria-live="polite">
			{#if isRestarting}
				Server is restarting. Please wait.
			{:else if countdown !== null}
				Server will restart automatically in {countdown} seconds.
			{:else}
				Server restart is required for changes to take effect.
			{/if}
		</div>
	</div>
{/if}
