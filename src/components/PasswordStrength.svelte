<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import { signUpFormSchema } from '@src/utils/formSchemas';
	import type { z } from 'zod';

	export let password: string = '';

	const MIN_PASSWORD_LENGTH = publicEnv.PASSWORD_STRENGTH || 8;
	const YELLOW_LENGTH = MIN_PASSWORD_LENGTH + 3;
	const GREEN_LENGTH = YELLOW_LENGTH + 4;

	function calculateScore(password: string) {
		let score = 0;

		if (password.length >= MIN_PASSWORD_LENGTH && password.length < YELLOW_LENGTH) score = 1;
		else if (password.length >= YELLOW_LENGTH && password.length < GREEN_LENGTH) score = 2;
		else if (password.length >= GREEN_LENGTH) score = 3;

		return score;
	}

	function getFeedback(score: number) {
		const messages = {
			0: 'Weak',
			1: 'Good',
			2: 'Strong'
		};

		return messages[Math.min(score, 2)] || 'Unknown';
	}

	function getColor(score: number) {
		if (score < 1) return 'red';
		else if (score < 2) return 'darkorange';
		else return 'green';
	}

	$: score = calculateScore(password);
	$: feedback = getFeedback(score);
	$: color = getColor(score);
	$: percentage = Math.min(100, (password.length / GREEN_LENGTH) * 100);
	$: textColor = color === 'darkorange' ? 'black' : 'white';
</script>

{#if password}
	<div class="relative -mt-1 flex w-full flex-col items-center justify-center">
		<div class="relative h-4 w-full rounded-sm transition duration-300 ease-in-out" style="background-color: {color}; width: {percentage}%;">
			<span class=" absolute inset-0 flex items-center justify-center text-xs font-bold" style="color: {textColor};">{feedback}</span>
		</div>
	</div>
{/if}

<style>
	div {
		width: 100%;
	}
</style>
