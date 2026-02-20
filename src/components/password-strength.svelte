<!--
@file src/components/password-strength.svelte
@component
**Enhanced PasswordStrength - Svelte 5 Optimized**

Visual password strength indicator with match validation and accessibility features.

@example
<PasswordStrength password={formData.password} confirmPassword={formData.confirmPassword} />

### Props
- `password` (string): Password value
- `confirmPassword` (string): Confirm password value
- `showRequirements` (boolean): Show password requirements list (default: false)

### Features
- Real-time strength calculation with complexity scoring
- Visual progress bar with animated feedback
- Password match validation
- Customizable strength thresholds
- Full ARIA support for screen readers
- Reduced motion support
- Smooth CSS transitions (no JS animation overhead)
- Performance optimized with derived state
- Password requirements checklist

### Improvements
- Better accessibility with comprehensive ARIA attributes
- Reduced motion support
- Memoized all calculations
- Requirements checklist for better UX
- Live regions for screen reader updates
- Semantic HTML structure
-->

<script lang="ts">
	import { fade, scale, slide } from 'svelte/transition';
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { onMount } from 'svelte';

	interface Props {
		confirmPassword?: string;
		password?: string;
		showRequirements?: boolean;
	}

	const { password = '', confirmPassword = '', showRequirements = false }: Props = $props();

	// Configuration
	const MIN_PASSWORD_LENGTH = publicEnv?.PASSWORD_LENGTH ?? 8;
	const YELLOW_LENGTH = MIN_PASSWORD_LENGTH + 3;
	const GREEN_LENGTH = YELLOW_LENGTH + 4;

	// State
	let prefersReducedMotion = $state(false);
	let showRequirementsList = $state(false);

	// Complexity checks (memoized)
	const complexityChecks = $derived.by(() => {
		const pwd = longerPassword;
		return {
			hasUpper: /[A-Z]/.test(pwd),
			hasLower: /[a-z]/.test(pwd),
			hasNumber: /\d/.test(pwd),
			hasSpecial: /[^A-Za-z0-9]/.test(pwd),
			hasMinLength: pwd.length >= MIN_PASSWORD_LENGTH
		};
	});

	// Calculate password score
	function calculateScore(pwd: string, checks: Record<string, boolean>): number {
		if (pwd.length === 0) {
			return 0;
		}

		let score = 0;

		// Base score from length
		if (pwd.length >= MIN_PASSWORD_LENGTH && pwd.length < YELLOW_LENGTH) {
			score = 1;
		} else if (pwd.length >= YELLOW_LENGTH && pwd.length < GREEN_LENGTH) {
			score = 2;
		} else if (pwd.length >= GREEN_LENGTH) {
			score = 3;
		}

		// Complexity bonus (excluding hasMinLength)
		const complexityCount = Object.entries(checks).filter(([key, value]) => key !== 'hasMinLength' && value).length;

		score += Math.floor(complexityCount / 2);

		return Math.min(score, 5);
	}

	// Feedback messages
	const FEEDBACK_MESSAGES: Record<number, string> = {
		0: 'Too Short',
		1: 'Weak',
		2: 'Fair',
		3: 'Good',
		4: 'Strong',
		5: 'Very Strong'
	};

	// Color classes
	const COLOR_CLASSES: Record<number, string> = {
		0: 'bg-gray-300 text-gray-700 dark:bg-gray-600 dark:text-gray-300',
		1: 'bg-red-500 text-white',
		2: 'bg-orange-500 text-white',
		3: 'bg-yellow-500 text-gray-900',
		4: 'bg-green-600 text-white',
		5: 'bg-green-500 text-white'
	};

	// Bar colors
	function getBarColor(barIndex: number, score: number): string {
		if (score === 0) {
			return 'bg-gray-200 dark:bg-gray-700';
		}
		if (barIndex === 0) {
			return score >= 1 ? 'bg-red-500' : 'bg-gray-200 dark:bg-gray-700';
		}
		if (barIndex === 1) {
			return score >= 2 ? 'bg-yellow-500' : 'bg-gray-200 dark:bg-gray-700';
		}
		return score >= 3 ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700';
	}

	// Derived values
	const longerPassword = $derived(password.length >= confirmPassword.length ? password : confirmPassword);

	const score = $derived(calculateScore(longerPassword, complexityChecks));
	const feedback = $derived(FEEDBACK_MESSAGES[score] || 'Unknown');
	const scoreColor = $derived(COLOR_CLASSES[score] || COLOR_CLASSES[0]);
	const showStrength = $derived(password.length > 0 || confirmPassword.length > 0);
	const percentage = $derived(Math.min(100, (longerPassword.length / GREEN_LENGTH) * 100));
	const passwordsMatch = $derived(password === confirmPassword && confirmPassword.length > 0 && password.length > 0);
	const showMatchIndicator = $derived(confirmPassword.length > 0);

	// Count met requirements
	const metRequirements = $derived(Object.values(complexityChecks).filter(Boolean).length);
	const totalRequirements = $derived(Object.keys(complexityChecks).length);

	// Accessibility label
	const strengthLabel = $derived(() => {
		const parts = [`Password strength: ${feedback}`];

		if (showMatchIndicator) {
			parts.push(passwordsMatch ? 'Passwords match' : 'Passwords do not match');
		}

		parts.push(`${metRequirements} of ${totalRequirements} requirements met`);

		return parts.join('. ');
	});

	// Toggle requirements list
	function toggleRequirements() {
		showRequirementsList = !showRequirementsList;
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
</script>

{#if showStrength}
	<div
		class="relative -mt-1 w-full space-y-2"
		role="region"
		aria-label="Password strength indicator"
		transition:fade={{ duration: prefersReducedMotion ? 0 : 200 }}
	>
		<!-- Progress bar container -->
		<div class="relative h-4 w-full overflow-hidden rounded-sm bg-gray-200 dark:bg-gray-700">
			<!-- Animated progress bar -->
			<div
				role="progressbar"
				aria-valuenow={Math.round(percentage)}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label={strengthLabel()}
				class="h-full rounded-sm transition-all {prefersReducedMotion ? 'duration-0' : 'duration-500 ease-out'} {scoreColor}"
				style="width: {percentage}%;"
			>
				<!-- Strength text -->
				{#if percentage > 25}
					<span
						class="absolute inset-0 flex items-center justify-center text-[10px] font-bold sm:text-xs"
						transition:fade={{ duration: prefersReducedMotion ? 0 : 200 }}
					>
						{feedback}
					</span>
				{/if}

				<!-- Screen reader announcement -->
				<span class="sr-only" aria-live="polite" aria-atomic="true"> {strengthLabel()} </span>
			</div>

			<!-- Shine effect (only when motion allowed) -->
			{#if !prefersReducedMotion && percentage > 0 && percentage < 100}
				<div
					class="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent opacity-60 transition-transform duration-500"
					style="transform: translateX({percentage - 20}%);"
					aria-hidden="true"
				></div>
			{/if}
		</div>

		<!-- Bottom row: Match indicator and strength bars -->
		<div class="flex min-h-7 w-full items-center justify-between gap-2">
			<!-- Left side: Match indicator or requirements toggle -->
			<div class="min-w-0 flex-1">
				{#if !showMatchIndicator}
					<div class="flex items-center gap-2">
						<span class="text-xs text-gray-500 dark:text-gray-400"> Strength </span>
						{#if showRequirements}
							<button
								type="button"
								onclick={toggleRequirements}
								class="text-xs text-primary-500 hover:text-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 rounded"
								aria-expanded={showRequirementsList}
								aria-controls="password-requirements"
							>
								{showRequirementsList ? 'Hide' : 'Show'}
								requirements
							</button>
						{/if}
					</div>
				{:else}
					<span
						class="text-xs transition-colors {prefersReducedMotion ? 'duration-0' : 'duration-200'}"
						class:text-red-500={!passwordsMatch}
						class:text-green-500={passwordsMatch}
						role="status"
						aria-live="polite"
						transition:fade={{ duration: prefersReducedMotion ? 0 : 200 }}
					>
						{passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
					</span>
				{/if}
			</div>

			<!-- Right side: Strength bars -->
			<div class="flex shrink-0 gap-1" role="presentation" aria-hidden="true">
				{#each [0, 1, 2] as barIndex (barIndex)}
					<div
						class="h-1.5 w-8 rounded-full transition-all {prefersReducedMotion ? 'duration-0' : 'duration-400 ease-out'} {getBarColor(
							barIndex,
							score
						)}"
						style="transform: scale({barIndex < score ? 1 : 0.8}); opacity: {barIndex <= score ? 1 : 0.3};"
					></div>
				{/each}
			</div>
		</div>

		<!-- Requirements checklist (collapsible) -->
		{#if showRequirements && showRequirementsList}
			<div
				id="password-requirements"
				class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
				transition:slide={{ duration: prefersReducedMotion ? 0 : 200 }}
			>
				<h4 class="mb-2 text-xs font-semibold text-gray-700 dark:text-gray-300">Password Requirements</h4>
				<ul class="space-y-1 text-xs" role="list">
					<li class="flex items-center gap-2">
						<span
							class="flex h-4 w-4 items-center justify-center rounded-full text-[10px] {complexityChecks.hasMinLength
								? 'bg-green-500 text-white'
								: 'bg-gray-300 text-gray-600 dark:bg-gray-600 dark:text-gray-400'}"
							aria-hidden="true"
						>
							{complexityChecks.hasMinLength ? '✓' : '○'}
						</span>
						<span class={complexityChecks.hasMinLength ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}>
							At least {MIN_PASSWORD_LENGTH} characters
						</span>
					</li>
					<li class="flex items-center gap-2">
						<span
							class="flex h-4 w-4 items-center justify-center rounded-full text-[10px] {complexityChecks.hasUpper
								? 'bg-green-500 text-white'
								: 'bg-gray-300 text-gray-600 dark:bg-gray-600 dark:text-gray-400'}"
							aria-hidden="true"
						>
							{complexityChecks.hasUpper ? '✓' : '○'}
						</span>
						<span class={complexityChecks.hasUpper ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}>
							One uppercase letter
						</span>
					</li>
					<li class="flex items-center gap-2">
						<span
							class="flex h-4 w-4 items-center justify-center rounded-full text-[10px] {complexityChecks.hasLower
								? 'bg-green-500 text-white'
								: 'bg-gray-300 text-gray-600 dark:bg-gray-600 dark:text-gray-400'}"
							aria-hidden="true"
						>
							{complexityChecks.hasLower ? '✓' : '○'}
						</span>
						<span class={complexityChecks.hasLower ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}>
							One lowercase letter
						</span>
					</li>
					<li class="flex items-center gap-2">
						<span
							class="flex h-4 w-4 items-center justify-center rounded-full text-[10px] {complexityChecks.hasNumber
								? 'bg-green-500 text-white'
								: 'bg-gray-300 text-gray-600 dark:bg-gray-600 dark:text-gray-400'}"
							aria-hidden="true"
						>
							{complexityChecks.hasNumber ? '✓' : '○'}
						</span>
						<span class={complexityChecks.hasNumber ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}> One number </span>
					</li>
					<li class="flex items-center gap-2">
						<span
							class="flex h-4 w-4 items-center justify-center rounded-full text-[10px] {complexityChecks.hasSpecial
								? 'bg-green-500 text-white'
								: 'bg-gray-300 text-gray-600 dark:bg-gray-600 dark:text-gray-400'}"
							aria-hidden="true"
						>
							{complexityChecks.hasSpecial ? '✓' : '○'}
						</span>
						<span class={complexityChecks.hasSpecial ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}>
							One special character (!@#$%^&*)
						</span>
					</li>
				</ul>
			</div>
		{/if}
	</div>
{/if}
