<script lang="ts">
	export let password: string = '';

	let MIN_LENGTH = 7;
	let YELLOW_LENGTH = MIN_LENGTH + 3;
	let GREEN_LENGTH = YELLOW_LENGTH + 4;

	function calculateScore(password: string) {
		let score = 0;

		// Check password length
		if (password.length >= MIN_LENGTH && password.length < YELLOW_LENGTH) score = password.length - MIN_LENGTH;
		else if (password.length >= YELLOW_LENGTH && password.length < GREEN_LENGTH) score = password.length - YELLOW_LENGTH;
		else if (password.length >= GREEN_LENGTH) score = password.length - GREEN_LENGTH;

		return score;
	}

	function getFeedback(score: number) {
		const messages = {
			0: 'Weak password. Include more character types.',
			1: 'Moderate password. Consider increasing length.',
			2: 'Strong password!'
		};

		return messages[score] || 'Unknown strength';
	}

	function getColor(score: number) {
		if (score < 1) return 'red';
		else if (score < 2) return 'yellow';
		else return 'green';
	}

	$: score = calculateScore(password);
	$: feedback = getFeedback(score);
	$: color = getColor(score);
	$: percentage = Math.min(100, (password.length / GREEN_LENGTH) * 100);
</script>

{#if password}
	<div class="flex flex-col items-center justify-center">
		<div class="progress-bar" style="background-color: {color}; width: {percentage}%;" />
		<span class="mt-1 text-sm text-primary-500">{feedback}</span>
	</div>
{/if}

<style lang="postcss">
	.progress-bar {
		height: 0.4rem;
		transition:
			width 0.2s ease-in-out,
			background-color 0.2s ease-in-out;
	}
</style>
