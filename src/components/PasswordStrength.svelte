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
- Displays password strength based on length
- Works with both password and confirm password fields
- Shows strength indicator only once
- Customizable minimum password length and strength thresholds
- Smooth animated transitions with Svelte's Tween store
- Responsive design with color-coded feedback
-->

<script lang="ts">
	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { publicEnv } from '@root/config/public';
	import { fade } from 'svelte/transition';

	interface Props {
		// Props for password and confirm password
		password?: string;
		confirmPassword?: string;
	}

	let { password = '', confirmPassword = '' }: Props = $props();

	// Customizable password strength thresholds
	const MIN_PASSWORD_LENGTH = publicEnv.PASSWORD_LENGTH || 8;
	const YELLOW_LENGTH = MIN_PASSWORD_LENGTH + 3;
	const GREEN_LENGTH = YELLOW_LENGTH + 4;

	// Tweened stores for smooth animations
	const tweenedPercentage = tweened(0, {
		duration: 400,
		easing: cubicOut
	});

	const tweenedOpacity = tweened(0, {
		duration: 300,
		easing: cubicOut
	});

	// Enhanced password Length score with complexity
	function calculateScore(pwd: string) {
		let score = 0;

		// Score based on password length
		if (pwd.length >= MIN_PASSWORD_LENGTH && pwd.length < YELLOW_LENGTH) score = 1;
		else if (pwd.length >= YELLOW_LENGTH && pwd.length < GREEN_LENGTH) score = 2;
		else if (pwd.length >= GREEN_LENGTH) score = 3;

		const hasUpper = /[A-Z]/.test(pwd);
		const hasLower = /[a-z]/.test(pwd);
		const hasNumber = /\d/.test(pwd);
		const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
		const complexityChecks = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
		score += Math.floor(complexityChecks / 2); // +1 for every 2 complexity checks met
		return Math.min(score, 5);
	}

	// Updated feedback messages
	function getFeedback(score: number) {
		const messages: Record<number, string> = {
			0: 'Too Short',
			1: 'Weak',
			2: 'Fair',
			3: 'Good',
			4: 'Strong',
			5: 'Very Strong'
		};
		return messages[score] || 'Unknown';
	}

	// Utility for color classes
	function getScoreColor(score: number): string {
		if (score <= 1) return 'bg-red-500 text-white';
		if (score === 2) return 'bg-orange-500 text-black';
		if (score === 3) return 'bg-yellow-500 text-black';
		if (score === 4) return 'bg-green-600 text-white';
		return 'bg-green-500 text-white';
	}

	// Reactive variables
	let longerPassword = $derived(password.length >= confirmPassword.length ? password : confirmPassword);
	let score = $derived(calculateScore(longerPassword));
	let feedback = $derived(getFeedback(score));
	let showStrength = $derived(password.length > 0 || confirmPassword.length > 0);

	// Update tweened values when derived values change
	$effect(() => {
		const newPercentage = Math.min(100, (longerPassword.length / GREEN_LENGTH) * 100);
		tweenedPercentage.set(newPercentage);
	});

	$effect(() => {
		tweenedOpacity.set(showStrength ? 1 : 0);
	});
</script>

{#if showStrength}
	<div class="relative -mt-1 flex w-full flex-col items-center justify-center transition-opacity duration-300" style="opacity: {$tweenedOpacity}">
		<!-- Background track -->
		<div class="relative h-4 w-full overflow-hidden rounded-sm bg-gray-200 dark:bg-gray-700">
			<!-- Animated progress bar -->
			<div
				role="progressbar"
				aria-valuenow={$tweenedPercentage}
				aria-valuemin="0"
				aria-valuemax="100"
				class="h-full rounded-sm transition-colors duration-500 ease-out {getScoreColor(score)}"
				style="width: {$tweenedPercentage}%; transform-origin: left;"
			>
				<!-- Animated text with smooth fade transition -->
				<span
					class="absolute inset-0 flex items-center justify-center text-[10px] font-bold transition-all duration-300 ease-out sm:text-xs"
					style="opacity: {$tweenedPercentage > 25 ? 1 : 0}; transform: translateY({$tweenedPercentage > 25 ? '0' : '4px'});"
				>
					{feedback}
				</span>
				<p class="sr-only">
					Password strength: {feedback}, Strength level: {score}/5
				</p>
			</div>
			<!-- Subtle shine effect for visual polish -->
			<div
				class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition-opacity duration-300"
				style="opacity: {$tweenedPercentage > 0 && $tweenedPercentage < 100 ? 0.6 : 0}; transform: translateX({$tweenedPercentage - 20}%);"
			></div>
		</div>

		<!-- Password match indicator and strength bars, always on the same line, no layout shift -->
		<div class="mt-1 flex min-h-[1.75rem] items-center space-x-3">
			<!-- Only show indicator if confirmPassword is empty -->
			{#if confirmPassword.length === 0}
				<span in:fade out:fade class="text-xs text-gray-500">Strength</span>
			{:else}
				<span
					in:fade={{ duration: 200 }}
					out:fade={{ duration: 150 }}
					class="text-xs transition-colors duration-200"
					class:text-red-500={password !== confirmPassword}
					class:text-green-500={password === confirmPassword}
				>
					{password !== confirmPassword ? 'Passwords do not match' : 'Passwords match'}
				</span>
			{/if}
			<!-- Strength bars: always on the same line as indicator/message -->
			<div class="flex space-x-1">
				{#each Array(3) as _, i}
					<div
						class="duration-400 h-1.5 w-8 rounded-full transition-all ease-out"
						class:bg-red-300={score < 1}
						class:bg-red-500={score >= 1 && i === 0}
						class:bg-yellow-300={score < 2 && i === 1}
						class:bg-yellow-500={score >= 2 && i === 1}
						class:bg-green-300={score < 3 && i === 2}
						class:bg-green-500={score >= 3 && i === 2}
						class:bg-gray-200={i > score}
						style="transform: scale({i < score ? 1 : 0.8}); opacity: {i <= score ? 1 : 0.3};"
					></div>
				{/each}
			</div>
		</div>
	</div>
{/if}
