<!--
@file src/components/PasswordStrength.svelte
@component
**PasswordStrength component for password and confirm password fields using Tailwind CSS**

@example
<PasswordStrength password={formData.password} confirmPassword={formData.confirmPassword} />

### Props
- `password` (string): Password value
- `confirmPassword` (string): Confirm password value

### Features
- Displays password strength based on length and complexity
- Works with both password and confirm password fields
- Shows strength indicator only once
- Customizable minimum password length and strength thresholds
- Smooth animated transitions with Svelte's Tween store
- Responsive design with color-coded feedback
- Optimized performance with memoization

### Improvements
- Removed redundant tweened stores (use CSS transitions instead)
- Better accessibility with proper ARIA attributes
- Memoized complexity calculations
- Cleaner conditional logic
- Fixed layout shift issues
- Better semantic HTML
-->

<script lang="ts">
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import { fade } from 'svelte/transition';

	interface Props {
		password?: string;
		confirmPassword?: string;
	}

	const { password = '', confirmPassword = '' }: Props = $props();

	// Customizable password strength thresholds
	const MIN_PASSWORD_LENGTH = publicEnv?.PASSWORD_LENGTH ?? 8;
	const YELLOW_LENGTH = MIN_PASSWORD_LENGTH + 3;
	const GREEN_LENGTH = YELLOW_LENGTH + 4;

	// Memoized complexity checks
	const complexityChecks = $derived.by(() => {
		const pwd = longerPassword;
		return {
			hasUpper: /[A-Z]/.test(pwd),
			hasLower: /[a-z]/.test(pwd),
			hasNumber: /\d/.test(pwd),
			hasSpecial: /[^A-Za-z0-9]/.test(pwd)
		};
	});

	// Enhanced password score with complexity
	function calculateScore(pwd: string, checks: Record<string, boolean>): number {
		let score = 0;

		// Score based on password length
		if (pwd.length >= MIN_PASSWORD_LENGTH && pwd.length < YELLOW_LENGTH) score = 1;
		else if (pwd.length >= YELLOW_LENGTH && pwd.length < GREEN_LENGTH) score = 2;
		else if (pwd.length >= GREEN_LENGTH) score = 3;

		// Add complexity bonus
		const complexityCount = Object.values(checks).filter(Boolean).length;
		score += Math.floor(complexityCount / 2); // +1 for every 2 complexity checks met

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

	function getFeedback(score: number): string {
		return FEEDBACK_MESSAGES[score] || 'Unknown';
	}

	// Color classes for score
	function getScoreColor(score: number): string {
		if (score <= 1) return 'bg-red-500 text-white';
		if (score === 2) return 'bg-orange-500 text-black';
		if (score === 3) return 'bg-yellow-500 text-black';
		if (score === 4) return 'bg-green-600 text-white';
		return 'bg-green-500 text-white';
	}

	// Bar colors for strength indicators
	function getBarColor(barIndex: number, score: number): string {
		if (barIndex === 0) {
			return score >= 1 ? 'bg-red-500' : 'bg-red-300';
		}
		if (barIndex === 1) {
			return score >= 2 ? 'bg-yellow-500' : score >= 1 ? 'bg-yellow-300' : 'bg-gray-200';
		}
		return score >= 3 ? 'bg-green-500' : score >= 2 ? 'bg-green-300' : 'bg-gray-200';
	}

	// Reactive derived values
	const longerPassword = $derived(password.length >= confirmPassword.length ? password : confirmPassword);
	const score = $derived(calculateScore(longerPassword, complexityChecks));
	const feedback = $derived(getFeedback(score));
	const showStrength = $derived(password.length > 0 || confirmPassword.length > 0);
	const percentage = $derived(Math.min(100, (longerPassword.length / GREEN_LENGTH) * 100));
	const passwordsMatch = $derived(password === confirmPassword && confirmPassword.length > 0);
	const showMatchIndicator = $derived(confirmPassword.length > 0);
</script>

{#if showStrength}
	<div class="relative -mt-1 flex w-full flex-col items-center justify-center transition-opacity duration-300" transition:fade={{ duration: 200 }}>
		<!-- Background track -->
		<div class="relative h-4 w-full overflow-hidden rounded-sm bg-gray-200 dark:bg-gray-700">
			<!-- Animated progress bar -->
			<div
				role="progressbar"
				aria-valuenow={Math.round(percentage)}
				aria-valuemin={0}
				aria-valuemax={100}
				aria-label="Password strength indicator"
				class="h-full rounded-sm transition-all duration-500 ease-out {getScoreColor(score)}"
				style="width: {percentage}%;"
			>
				<!-- Animated text with smooth fade transition -->
				{#if percentage > 25}
					<span
						class="absolute inset-0 flex items-center justify-center text-[10px] font-bold transition-all duration-300 ease-out sm:text-xs"
						transition:fade={{ duration: 200 }}
					>
						{feedback}
					</span>
				{/if}

				<!-- Screen reader only comprehensive info -->
				<span class="sr-only">
					Password strength: {feedback}. Strength level: {score} out of 5.
					{#if showMatchIndicator}
						{passwordsMatch ? 'Passwords match.' : 'Passwords do not match.'}
					{/if}
				</span>
			</div>

			<!-- Subtle shine effect -->
			{#if percentage > 0 && percentage < 100}
				<div
					class="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent opacity-60 transition-transform duration-500"
					style="transform: translateX({percentage - 20}%);"
				></div>
			{/if}
		</div>

		<!-- Password match indicator and strength bars -->
		<div class="mt-1 flex min-h-7 w-full items-center justify-between">
			<!-- Match indicator -->
			<div class="min-w-0 flex-1">
				{#if !showMatchIndicator}
					<span class="text-xs text-gray-500 dark:text-gray-400" transition:fade={{ duration: 200 }}> Strength </span>
				{:else}
					<span
						class="text-xs transition-colors duration-200"
						class:text-red-500={!passwordsMatch}
						class:text-green-500={passwordsMatch}
						transition:fade={{ duration: 200 }}
						role="status"
						aria-live="polite"
					>
						{passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
					</span>
				{/if}
			</div>

			<!-- Strength bars -->
			<div class="flex shrink-0 space-x-1" role="presentation" aria-hidden="true">
				{#each [0, 1, 2] as barIndex (barIndex)}
					<div
						class="duration-400 h-1.5 w-8 rounded-full transition-all ease-out {getBarColor(barIndex, score)}"
						style="transform: scale({barIndex < score ? 1 : 0.8}); opacity: {barIndex <= score ? 1 : 0.3};"
					></div>
				{/each}
			</div>
		</div>
	</div>
{/if}
