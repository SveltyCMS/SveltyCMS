<!--
@file src/components/PasswordStrength.svelte
@description PasswordStrength component for password and confirm password fields using Tailwind CSS
@features
- Displays password strength based on length
- Works with both password and confirm password fields
- Shows strength indicator only once
- Customizable minimum password length and strength thresholds
- Responsive design with color-coded feedback

@usage
<PasswordStrength password={formData.password} confirmPassword={formData.confirmPassword} />
-->

<script lang="ts">
	import { publicEnv } from '@root/config/public';

	// Props for password and confirm password
	export let password: string = '';
	export let confirmPassword: string = '';

	// Customizable password strength thresholds
	const MIN_PASSWORD_LENGTH = publicEnv.PASSWORD_STRENGTH || 8;
	const YELLOW_LENGTH = MIN_PASSWORD_LENGTH + 3;
	const GREEN_LENGTH = YELLOW_LENGTH + 4;

	// Calculate password strength score
	function calculateScore(pwd: string) {
		let score = 0;

		// Score based on password length
		if (pwd.length >= MIN_PASSWORD_LENGTH && pwd.length < YELLOW_LENGTH) score = 1;
		else if (pwd.length >= YELLOW_LENGTH && pwd.length < GREEN_LENGTH) score = 2;
		else if (pwd.length >= GREEN_LENGTH) score = 3;

		// TODO: Add additional checks for password complexity (e.g., numbers, special characters)

		return score;
	}

	// Get feedback message based on score
	function getFeedback(score: number) {
		const messages = {
			0: 'Weak',
			1: 'Good',
			2: 'Strong'
		};

		return messages[Math.min(score, 2)] || 'Unknown';
	}

	// Get Tailwind color classes based on score
	function getColorClasses(score: number) {
		if (score < 1) return 'bg-red-500 text-white';
		else if (score < 2) return 'bg-yellow-500 text-black';
		else return 'bg-green-500 text-white';
	}

	// Reactive variables
	$: longerPassword = password.length >= confirmPassword.length ? password : confirmPassword;
	$: score = calculateScore(longerPassword);
	$: feedback = getFeedback(score);
	$: colorClasses = getColorClasses(score);
	$: percentage = Math.min(100, (longerPassword.length / GREEN_LENGTH) * 100);
	$: showStrength = password.length > 0 || confirmPassword.length > 0;
</script>

{#if showStrength}
	<div class="relative -mt-1 flex w-full flex-col items-center justify-center">
		<div class="relative h-4 w-full rounded-sm transition-all duration-300 ease-in-out {colorClasses}" style="width: {percentage}%;">
			<span class="absolute inset-0 flex items-center justify-center text-xs font-bold">{feedback}</span>
		</div>
	</div>
{/if}
