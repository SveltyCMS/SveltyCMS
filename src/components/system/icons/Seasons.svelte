<script lang="ts">
	import { publicEnv } from '@root/config/public';

	import { Confetti } from 'svelte-confetti';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Calculate Easter Sunday
	function calculateEasterSunday(year: number): Date {
		const f = Math.floor;
		const G = year % 19;
		const C = f(year / 100);
		const H = (C - f(C / 4) - f((8 * C + 13) / 25) + 19 * G + 15) % 30;
		const I = H - f(H / 28) * (1 - f(29 / (H + 1)) * f((21 - G) / 11));
		const J = (year + f(year / 4) + I + 2 - C + f(C / 4)) % 7;
		const L = I - J;
		const month = 3 + f((L + 40) / 44);
		const day = L + 28 - 31 * f(month / 4);

		return new Date(year, month - 1, day);
	}

	// Calculate Eastertide End Date
	function calculateEastertideEndDate(year: number): Date {
		const easterSunday = calculateEasterSunday(year);
		easterSunday.setDate(easterSunday.getDate() + 49); // Add 49 days for Pentecost Sunday
		return easterSunday;
	}

	// Get current date / year
	const date = new Date();
	const year = date.getFullYear();

	// Seasons
	const isNewYear = date.getMonth() === 0 && date.getDate() === 1;
	const isHalloween = date.getMonth() === 9 && date.getDate() === 31;
	const isDecember = date.getMonth() === 11;
	const easterSunday = calculateEasterSunday(year);
	const eastertideEndDate = calculateEastertideEndDate(year);
	const isEaster = date >= easterSunday && date <= eastertideEndDate;
</script>

{#if publicEnv.SEASONS === true && publicEnv.SEASON_REGION === 'Europe'}
	{#if isNewYear && !isDecember}
		<div class="absolute left-1/2 top-[-50px] justify-center">
			<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[0, 50]} colorRange={[0, 120]} />
			<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[550, 550]} colorRange={[120, 240]} />
			<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[1000, 1050]} colorRange={[240, 360]} />
		</div>
		<p class="absolute left-[-40px] top-[-50px] justify-center whitespace-nowrap text-2xl font-bold text-error-500">
			{m.login_new_year()}
			{new Date().getFullYear()}
		</p>
	{/if}

	{#if isEaster}
		<iconify-icon icon="mdi:egg-easter" width="40" class="absolute -top-[18px] left-3 -rotate-[16deg] text-tertiary-500" />
		<iconify-icon icon="game-icons:easter-egg" width="40" class="absolute -top-[28px] right-[1em] rotate-12 text-yellow-500" />
		<iconify-icon icon="game-icons:high-grass" width="40" class="absolute -top-[34px] left-10 -rotate-12 text-green-500" />
		<iconify-icon icon="mdi:easter" width="70" class="absolute -top-[62px] right-9 rotate-6 text-red-500" />
	{/if}

	{#if isHalloween}
		<img src="/seasons/Halloween.avif" alt="Spider" class="absolute -bottom-[170px] left-0" />
	{/if}

	{#if isDecember && !isNewYear}
		<img src="/seasons/SantaHat.avif" alt="Santa hat" class="absolute -right-5 -top-5 h-20 w-20" />
	{/if}
{/if}
