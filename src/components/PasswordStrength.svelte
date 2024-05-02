<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import { signUpFormSchema } from '@src/utils/formSchemas';

	export let password: string = '';

	const { password: passwordSchema } = signUpFormSchema.shape();
	const constraints = passwordSchema?._def.checks || [];

	const MIN_PASSWORD_LENGTH = publicEnv.PASSWORD_STRENGTH || 8;
	let YELLOW_LENGTH = MIN_PASSWORD_LENGTH + 3;
	let GREEN_LENGTH = YELLOW_LENGTH + 4;

	function calculateScore(password: string) {
		let score = 0;

		// Check password length
		if (password.length >= MIN_PASSWORD_LENGTH && password.length < YELLOW_LENGTH) score = password.length - MIN_PASSWORD_LENGTH;
		else if (password.length >= YELLOW_LENGTH && password.length < GREEN_LENGTH) score = password.length - YELLOW_LENGTH;
		else if (password.length >= GREEN_LENGTH) score = password.length - GREEN_LENGTH;

		return score;
	}

	function getFeedback(score: number) {
		const messages = {
			0: getPasswordFeedback('weak', constraints),
			1: getPasswordFeedback('moderate', constraints),
			2: getPasswordFeedback('strong', constraints)
		};

		return messages[Math.min(score, 2)] || 'Unknown strength';
	}

	function getPasswordFeedback(
		strength: 'weak' | 'moderate' | 'strong',
		constraints: Array<{ code?: import('zod').ZodIssueCode; message?: string }>
	) {
		const messages = {
			weak: 'Your password is too weak. Please include at least one uppercase letter, one lowercase letter, one number, and one special character.',
			moderate: 'Your password is moderately strong. Consider including more character types for a stronger password.',
			strong: 'Your password is strong!'
		};

		const constraintMessages = constraints.map((constraint) => constraint.message);

		return `${messages[strength]} ${constraintMessages.join(' ')}`;
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
