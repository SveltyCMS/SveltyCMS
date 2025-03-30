<!--
@file src/components/system/icons/Seasons.svelte
@component 
**Dynamically displays seasonal greetings and festival-based UI decorations based on the configured `publicEnv.SEASON_REGION`. Supports regional celebrations for Western Europe, East Asia, and South Asia, with conditional rendering of festive messages and animations**

@example
<Seasons />

#### Props:
- None

### Features 
- Regional support: Western Europe, East Asia, South Asia.
- Detects and highlights key festivals such as:
  - **Western Europe**: New Year, Valentine's Day, Easter, May Day, Halloween, Christmas.
  - **East Asia**: Chinese New Year, Cherry Blossom Season, Dragon Boat Festival, Mid-Autumn Festival.
  - **South Asia**: Diwali, Holi, Navratri.
- Implements dynamic date calculations for movable festivals (e.g., Easter, Diwali, Chinese New Year).
- Enhances user experience with festive icons, confetti effects, and gradient overlays during celebrations.
- Fully configurable via `publicEnv.SEASONS` and `publicEnv.SEASON_REGION` settings.
-->

<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import { Confetti } from 'svelte-confetti';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Calculate Easter Sunday (Gregorian calendar)
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

	// Calculate Chinese New Year (lunisolar calendar)
	function calculateChineseNewYear(year: number): Date {
		// Chinese New Year falls between Jan 21 and Feb 20
		const base = new Date(year, 0, 21); // Jan 21
		const lunarOffset = Math.floor(
			((year - 1900) * 365.25 + // Days since 1900
				(year - 1900) / 4 - // Leap year adjustment
				(year - 1900) / 100 + // Century adjustment
				(year - 1900) / 400) % // 400-year cycle
				29.5305882 // Lunar month length
		);
		base.setDate(base.getDate() + lunarOffset);
		return base;
	}

	// Calculate Mid-Autumn Festival (15th day of 8th lunar month)
	function calculateMidAutumnFestival(year: number): Date {
		const base = new Date(year, 8, 15); // Approximate date
		return base;
	}

	// Calculate Dragon Boat Festival (5th day of 5th lunar month)
	function calculateDragonBoatFestival(year: number): Date {
		const base = new Date(year, 5, 5); // Approximate date
		return base;
	}

	// Calculate Cherry Blossom Season
	function isCherryBlossomSeason(date: Date): boolean {
		return date.getMonth() === 3; // April is cherry blossom season
	}

	// Calculate Diwali (lunisolar calendar)
	function calculateDiwali(year: number): Date {
		// Diwali usually falls between mid-October and mid-November
		const baseDate = new Date(year, 9, 15); // October 15
		const lunarPhase = ((year - 1900) * 12.37) % 30; // Approximate lunar phase
		const daysToAdd = Math.floor(lunarPhase + 15) % 30;
		baseDate.setDate(baseDate.getDate() + daysToAdd);
		return baseDate;
	}

	// Calculate Holi (Full moon day in Phalguna month)
	function calculateHoli(year: number): Date {
		return new Date(year, 2, 15); // Approximate date in March
	}

	// Calculate Navratri (Nine nights festival)
	function calculateNavratri(year: number): Date {
		return new Date(year, 9, 7); // Approximate start date in October
	}

	// Get current date / year
	const date = new Date();
	const year = date.getFullYear();

	// Western European Festivals
	const isNewYear = date.getMonth() === 0 && date.getDate() === 1;
	const isValentine = date.getMonth() === 1 && date.getDate() === 14;
	const isMayDay = date.getMonth() === 4 && date.getDate() === 1;
	const isHalloween = date.getMonth() === 9 && date.getDate() === 31;
	const isDecember = date.getMonth() === 11;
	const isChristmas = (date.getMonth() === 11 && date.getDate() === 25) || (date.getMonth() === 11 && date.getDate() === 24);
	const easterSunday = calculateEasterSunday(year);
	const eastertideEndDate = calculateEastertideEndDate(year);
	const isEaster = date >= easterSunday && date <= eastertideEndDate;

	// East Asian Festivals
	const chineseNewYear = calculateChineseNewYear(year);
	const isChineseNewYear = Math.abs(date.getTime() - chineseNewYear.getTime()) < 24 * 60 * 60 * 1000 * 3; // 3 days celebration
	const midAutumnFestival = calculateMidAutumnFestival(year);
	const isMidAutumnFestival = Math.abs(date.getTime() - midAutumnFestival.getTime()) < 24 * 60 * 60 * 1000; // 1 day
	const dragonBoatFestival = calculateDragonBoatFestival(year);
	const isDragonBoatFestival = Math.abs(date.getTime() - dragonBoatFestival.getTime()) < 24 * 60 * 60 * 1000; // 1 day
	const isCherryBlossom = isCherryBlossomSeason(date);

	// South Asian Festivals
	const diwali = calculateDiwali(year);
	const isDiwali = Math.abs(date.getTime() - diwali.getTime()) < 24 * 60 * 60 * 1000 * 5; // 5 days celebration
	const holi = calculateHoli(year);
	const isHoli = Math.abs(date.getTime() - holi.getTime()) < 24 * 60 * 60 * 1000 * 2; // 2 days celebration
	const navratri = calculateNavratri(year);
	const isNavratri = Math.abs(date.getTime() - navratri.getTime()) < 24 * 60 * 60 * 1000 * 9; // 9 days celebration
</script>

{#if publicEnv.SEASONS === true}
	{#if publicEnv.SEASON_REGION === 'Western_Europe'}
		{#if isNewYear && !isDecember}
			<!-- New Year New Confetti -->

			<div class="-translate-y-1/2> absolute -top-28 left-1/2 z-10 -translate-x-1/2">
				<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[0, 50]} colorRange={[0, 120]} />
				<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[550, 550]} colorRange={[120, 240]} />
				<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[1000, 1050]} colorRange={[240, 360]} />
			</div>

			<!-- New Year-->
			<p class="text-error-500 absolute -top-28 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 text-4xl font-bold whitespace-nowrap">
				{m.login_new_year()}
			</p>

			<p class="text-error-500 absolute top-28 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 text-5xl font-bold whitespace-nowrap">
				{new Date().getFullYear()}
			</p>
		{/if}
		{#if isValentine}
			<div class=" absolute -top-28 left-1/2 -translate-x-1/2 -translate-y-1/2">
				<iconify-icon icon="mdi:heart" width="40" class="absolute -top-[10px] -left-[60px] text-red-600"></iconify-icon>
				<iconify-icon icon="mdi:cards-heart" width="40" class="absolute -top-[20px] -right-[60px] text-pink-500"></iconify-icon>
			</div>

			<p class="absolute top-28 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 text-4xl font-bold whitespace-nowrap text-pink-500">
				Happy Valintine's Day
			</p>
		{/if}

		{#if isEaster}
			<div class="absolute -top-24 left-1/2 -translate-x-1/2 -translate-y-1/2">
				<iconify-icon icon="mdi:egg-easter" width="40" class="text-tertiary-500 absolute -top-[18px] right-2 -rotate-[25deg]"></iconify-icon>
				<iconify-icon icon="game-icons:easter-egg" width="40" class="absolute -top-[25px] left-0 rotate-12 text-yellow-500"></iconify-icon>
				<iconify-icon icon="game-icons:high-grass" width="40" class="absolute -top-[5px] right-10 -rotate-[32deg] text-green-500"></iconify-icon>
				<iconify-icon icon="mdi:easter" width="70" class="absolute -top-[31px] left-8 rotate-[32deg] text-red-500"></iconify-icon>
			</div>
		{/if}

		{#if isMayDay}
			<div class="absolute -top-24 left-1/2 -translate-x-1/2 -translate-y-1/2">
				<iconify-icon icon="noto:tulip" width="60" class="absolute -top-[45px] -left-[16px] rotate-12"></iconify-icon>
				<iconify-icon icon="fluent-emoji:tulip" width="40" class="absolute -top-[14px] right-[20px] -rotate-12"></iconify-icon>
				<iconify-icon icon="noto:sunflower" width="50" class="absolute -top-[16px] left-10 rotate-6"></iconify-icon>
			</div>
		{/if}

		{#if isHalloween}
			<div class="">Halloween</div>
			<img src="/seasons/Halloween.avif" alt="Spider" class="absolute -bottom-[200px] left-1/2 -translate-x-1/2 -translate-y-1/2" />
		{/if}

		{#if isChristmas}
			<img
				src="/seasons/SantaHat.avif"
				alt="Santa hat"
				class="absolute
			-top-14 -right-[105px] h-20 w-20 -translate-x-1/2 -translate-y-1/2"
			/>
		{/if}
	{/if}

	{#if publicEnv.SEASON_REGION === 'East_Asia'}
		{#if isChineseNewYear}
			<div class="absolute top-[-50px] left-1/2 justify-center">
				<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[0, 50]} colorRange={[0, 60]} />
				<iconify-icon icon="noto:lantern" width="40" class="absolute -top-[20px] -left-[60px] text-red-600"></iconify-icon>
				<iconify-icon icon="noto:dragon-face" width="40" class="absolute -top-[20px] -right-[60px]"></iconify-icon>
			</div>
			<p class="absolute top-[-50px] left-[-40px] justify-center text-2xl font-bold whitespace-nowrap text-red-600">{m.login_new_year()}</p>
		{/if}

		{#if isCherryBlossom}
			<div class="absolute top-[-50px] left-1/2 justify-center">
				<iconify-icon icon="noto:cherry-blossom" width="40" class="absolute -top-[20px] -left-[60px] text-pink-400"></iconify-icon>
				<iconify-icon icon="noto:cherry-blossom" width="60" class="absolute top-[40px] -right-[140px] text-pink-300"></iconify-icon>
				<iconify-icon icon="noto:white-flower" width="60" class="absolute top-[40px] -left-[140px] text-pink-300"></iconify-icon>
			</div>
		{/if}

		{#if isDragonBoatFestival}
			<div class="absolute top-[-50px] left-1/2 justify-center">
				<iconify-icon icon="noto:dragon" width="100" class="absolute -top-[35px] -left-[00px] rotate-12"></iconify-icon>
			</div>
		{/if}

		{#if isMidAutumnFestival}
			<div class="absolute top-[-50px] left-1/2 justify-center">
				<iconify-icon icon="noto:full-moon" width="80" class="absolute -top-[10px] -left-[100px]"></iconify-icon>
				<iconify-icon icon="noto:moon-cake" width="60" class="absolute top-[220px] -right-[120px]"></iconify-icon>
			</div>
		{/if}
	{/if}

	{#if publicEnv.SEASON_REGION === 'South_Asia'}
		{#if isDiwali}
			<div class="absolute top-[-50px] left-1/2 justify-center">
				<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[0, 50]} colorRange={[30, 60]} />
				<iconify-icon icon="noto:diya-lamp" width="70" class="absolute top-[190px] left-[120px]"></iconify-icon>
				<iconify-icon icon="noto:sparkles" width="50" class="absolute top-[120px] -right-[160px] text-yellow-500"></iconify-icon>
				<iconify-icon icon="noto:sparkles" width="50" class="text-warning-500 absolute top-[100px] -right-[200px] rotate-90"></iconify-icon>
			</div>
			<p class="absolute top-[170px] -left-[10px] justify-center text-3xl font-bold whitespace-nowrap text-yellow-600 italic">
				{m.login_happy_diwali()}
			</p>
		{/if}

		{#if isHoli}
			<div class="absolute inset-0 flex">
				<!-- Powder  -->
				<div class="h-full w-full translate-y-8 bg-linear-to-b from-red-300/80 via-red-400/80 to-transparent blur-xl"></div>
				<div class="h-full w-full translate-y-12 bg-linear-to-b from-yellow-200/80 via-yellow-300/80 to-transparent blur-xl"></div>
				<div class="h-full w-full translate-y-8 bg-linear-to-b from-green-300/80 via-green-400/80 to-transparent blur-xl"></div>
				<div class="h-full w-full translate-y-12 bg-linear-to-b from-cyan-300/80 via-cyan-400/80 to-transparent blur-xl"></div>
				<div class="h-full w-full translate-y-8 bg-linear-to-b from-blue-300/80 via-blue-400/80 to-transparent blur-xl"></div>
				<div class="h-full w-full translate-y-12 bg-linear-to-b from-purple-300/80 via-purple-400/80 to-transparent blur-xl"></div>
			</div>

			<div class="absolute top-[-50px] left-1/2 justify-center">
				<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[0, 50]} colorRange={[0, 360]} />
				<iconify-icon icon="noto:balloon" width="40" class="absolute -top-[20px] -left-[60px] text-purple-500"></iconify-icon>
				<iconify-icon icon="noto:balloon" width="50" class="absolute top-[20px] right-[60px] text-green-500"></iconify-icon>
				<iconify-icon icon="game-icons:powder" width="50" class="text-primary-500 absolute top-[220px] -right-[150px]"></iconify-icon>
				<iconify-icon icon="game-icons:powder" width="30" class="text-warning-500 absolute top-[220px] -right-[120px] -rotate-12"></iconify-icon>
			</div>
			<p
				class="absolute top-[170px] -left-[30px] justify-center bg-linear-to-br from-pink-500 to-violet-500 box-decoration-clone bg-clip-text text-4xl font-bold text-transparent"
			>
				{m.login_Happy_Holi()}
			</p>
		{/if}
		{#if isNavratri}
			<div class="absolute top-[-50px] left-1/2 justify-center">
				<iconify-icon icon="noto:prayer-beads" width="40" class="absolute top-[30px] -left-[100px]"></iconify-icon>
				<iconify-icon icon="token-branded:starl" width="40" class="absolute -top-[20px] -right-[60px]"></iconify-icon>
				<iconify-icon icon="token-branded:starl" width="60" class="absolute top-[50px] -right-[160px]"></iconify-icon>
			</div>

			<p
				class="to-warning-500 absolute top-[170px] -left-[30px] justify-center bg-linear-to-br from-pink-500 box-decoration-clone bg-clip-text text-4xl font-bold text-nowrap text-transparent"
			>
				{m.login_happy_navratri()}
			</p>
		{/if}
	{/if}
{/if}
