<!--
@file src/components/system/icons/Seasons.svelte
@component Seasons Component

@description 
Dynamically displays seasonal greetings and festival-based UI decorations based on the configured `publicEnv.SEASON_REGION`. Supports regional celebrations for Western Europe, East Asia, and South Asia, with conditional rendering of festive messages and animations.

@features 
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

	// Utility function for date comparison
	function isDateInRange(date: Date, start: Date, end: Date): boolean {
		return date >= start && date <= end;
	}

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

	// Precompute festival dates
	const easterSunday = calculateEasterSunday(year);
	const eastertideEndDate = new Date(easterSunday);
	eastertideEndDate.setDate(easterSunday.getDate() + 6); // 7-day celebration: Easter Sunday to Saturday

	const chineseNewYear = calculateChineseNewYear(year);
	const midAutumnFestival = calculateMidAutumnFestival(year);
	const dragonBoatFestival = calculateDragonBoatFestival(year);
	const diwali = calculateDiwali(year);
	const holi = calculateHoli(year);
	const navratri = calculateNavratri(year);

	// Western European Festivals
	const isNewYear = date.getMonth() === 0 && date.getDate() === 1;
	const isValentine = date.getMonth() === 1 && date.getDate() === 14;
	const isMayDay = date.getMonth() === 4 && date.getDate() === 1;
	const isHalloween = date.getMonth() === 9 && date.getDate() === 31;
	const isChristmas = date.getMonth() === 11 && (date.getDate() === 24 || date.getDate() === 25);
	const isEaster = isDateInRange(date, easterSunday, eastertideEndDate);

	// East Asian Festivals
	const isChineseNewYear = Math.abs(date.getTime() - chineseNewYear.getTime()) < 3 * 24 * 60 * 60 * 1000; // 3 days
	const isMidAutumnFestival = date.toDateString() === midAutumnFestival.toDateString();
	const isDragonBoatFestival = date.toDateString() === dragonBoatFestival.toDateString();
	const isCherryBlossom = date.getMonth() === 3; // April

	// South Asian Festivals
	const isDiwali = Math.abs(date.getTime() - diwali.getTime()) < 5 * 24 * 60 * 60 * 1000; // 5 days
	const isHoli = Math.abs(date.getTime() - holi.getTime()) < 2 * 24 * 60 * 60 * 1000; // 2 days
	const isNavratri = Math.abs(date.getTime() - navratri.getTime()) < 9 * 24 * 60 * 60 * 1000; // 9 days
</script>

{#if publicEnv.SEASONS === true}
	{#if publicEnv.SEASON_REGION === 'Western_Europe'}
		{#if isNewYear && date.getMonth() !== 11}
			<!-- New Year -->
			<div class="-translate-y-1/2> absolute -top-28 left-1/2 z-10 -translate-x-1/2">
				<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[0, 50]} colorRange={[0, 120]} />
				<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[550, 550]} colorRange={[120, 240]} />
				<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[1000, 1050]} colorRange={[240, 360]} />
			</div>

			<!-- New Year-->
			<p class="absolute -top-28 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-4xl font-bold text-error-500">
				{m.login_new_year()}
			</p>

			<p class="absolute left-1/2 top-28 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-5xl font-bold text-error-500">
				{new Date().getFullYear()}
			</p>
		{/if}
		{#if isValentine}
			<!-- Valentine's Day -->
			<div class=" absolute -top-28 left-1/2 -translate-x-1/2 -translate-y-1/2">
				<iconify-icon icon="mdi:heart" width="40" class="absolute -left-[60px] -top-[10px] text-red-600"></iconify-icon>
				<iconify-icon icon="mdi:cards-heart" width="40" class="absolute -right-[60px] -top-[20px] text-pink-500"></iconify-icon>
			</div>

			<p class="absolute left-1/2 top-28 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-4xl font-bold text-pink-500">
				Happy Valintine's Day
			</p>
		{/if}

		{#if isEaster}
			<!-- Easter -->
			<div class="absolute -top-24 left-1/2 -translate-x-1/2 -translate-y-1/2">
				<iconify-icon icon="mdi:egg-easter" width="40" class="absolute -top-[18px] right-2 -rotate-[25deg] text-tertiary-500"></iconify-icon>
				<iconify-icon icon="game-icons:easter-egg" width="40" class="absolute -top-[25px] left-0 rotate-12 text-yellow-500"></iconify-icon>
				<iconify-icon icon="game-icons:high-grass" width="40" class="absolute -top-[5px] right-10 -rotate-[32deg] text-green-500"></iconify-icon>
				<iconify-icon icon="mdi:easter" width="70" class="absolute -top-[31px] left-8 rotate-[32deg] text-red-500"></iconify-icon>
			</div>
		{/if}

		{#if isMayDay}
			<!-- May Day -->
			<div class="absolute -top-24 left-1/2 -translate-x-1/2 -translate-y-1/2">
				<iconify-icon icon="noto:tulip" width="60" class="absolute -left-[16px] -top-[45px] rotate-12"></iconify-icon>
				<iconify-icon icon="fluent-emoji:tulip" width="40" class="absolute -top-[14px] right-[20px] -rotate-12"></iconify-icon>
				<iconify-icon icon="noto:sunflower" width="50" class="absolute -top-[16px] left-10 rotate-6"></iconify-icon>
			</div>
		{/if}

		{#if isHalloween}
			<!-- Halloween -->
			<div class="">Halloween</div>
			<img src="/seasons/Halloween.avif" alt="Spider" class="absolute -bottom-[200px] left-1/2 -translate-x-1/2 -translate-y-1/2" />
		{/if}

		{#if isChristmas}
			<!-- Christmas -->
			<img
				src="/seasons/SantaHat.avif"
				alt="Santa hat"
				class="absolute
			-right-[105px] -top-14 h-20 w-20 -translate-x-1/2 -translate-y-1/2"
			/>
		{/if}
	{/if}

	{#if publicEnv.SEASON_REGION === 'East_Asia'}
		{#if isChineseNewYear}
			<!-- Chinese New Year -->
			<div class="absolute left-1/2 top-[-50px] justify-center">
				<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[0, 50]} colorRange={[0, 60]} />
				<iconify-icon icon="noto:lantern" width="40" class="absolute -left-[60px] -top-[20px] text-red-600"></iconify-icon>
				<iconify-icon icon="noto:dragon-face" width="40" class="absolute -right-[60px] -top-[20px]"></iconify-icon>
			</div>
			<p class="absolute left-[-40px] top-[-50px] justify-center whitespace-nowrap text-2xl font-bold text-red-600">
				{m.login_new_year()}
			</p>
		{/if}

		{#if isCherryBlossom}
			<!-- Cherry Blossom Season -->
			<div class="absolute left-1/2 top-[-50px] justify-center">
				<iconify-icon icon="noto:cherry-blossom" width="40" class="absolute -left-[60px] -top-[20px] text-pink-400"></iconify-icon>
				<iconify-icon icon="noto:cherry-blossom" width="60" class="absolute -right-[140px] top-[40px] text-pink-300"></iconify-icon>
				<iconify-icon icon="noto:white-flower" width="60" class="absolute -left-[140px] top-[40px] text-pink-300"></iconify-icon>
			</div>
		{/if}

		{#if isDragonBoatFestival}
			<!-- Dragon Boat Festival -->
			<div class="absolute left-1/2 top-[-50px] justify-center">
				<iconify-icon icon="noto:dragon" width="100" class="absolute -left-[00px] -top-[35px] rotate-12"></iconify-icon>
			</div>
		{/if}

		{#if isMidAutumnFestival}
			<!-- Mid-Autumn Festival -->
			<div class="absolute left-1/2 top-[-50px] justify-center">
				<iconify-icon icon="noto:full-moon" width="80" class="absolute -left-[100px] -top-[10px]"></iconify-icon>
				<iconify-icon icon="noto:moon-cake" width="60" class="absolute -right-[120px] top-[220px]"></iconify-icon>
			</div>
		{/if}
	{/if}

	{#if publicEnv.SEASON_REGION === 'South_Asia'}
		{#if isDiwali}
			<!-- Diwali -->
			<div class="absolute left-1/2 top-[-50px] justify-center">
				<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[0, 50]} colorRange={[30, 60]} />
				<iconify-icon icon="noto:diya-lamp" width="70" class="absolute left-[120px] top-[190px]"></iconify-icon>
				<iconify-icon icon="noto:sparkles" width="50" class="absolute -right-[160px] top-[120px] text-yellow-500"></iconify-icon>
				<iconify-icon icon="noto:sparkles" width="50" class="absolute -right-[200px] top-[100px] rotate-90 text-warning-500"></iconify-icon>
			</div>
			<p class="absolute -left-[10px] top-[170px] justify-center whitespace-nowrap text-3xl font-bold italic text-yellow-600">
				{m.login_happy_diwali()}
			</p>
		{/if}

		{#if isHoli}
			<!-- Holi -->
			<div class="absolute inset-0 flex">
				<!-- Powder  -->
				<div class="h-full w-full translate-y-8 bg-gradient-to-b from-red-300/80 via-red-400/80 to-transparent blur-xl"></div>
				<div class="h-full w-full translate-y-12 bg-gradient-to-b from-yellow-200/80 via-yellow-300/80 to-transparent blur-xl"></div>
				<div class="h-full w-full translate-y-8 bg-gradient-to-b from-green-300/80 via-green-400/80 to-transparent blur-xl"></div>
				<div class="h-full w-full translate-y-12 bg-gradient-to-b from-cyan-300/80 via-cyan-400/80 to-transparent blur-xl"></div>
				<div class="h-full w-full translate-y-8 bg-gradient-to-b from-blue-300/80 via-blue-400/80 to-transparent blur-xl"></div>
				<div class="h-full w-full translate-y-12 bg-gradient-to-b from-purple-300/80 via-purple-400/80 to-transparent blur-xl"></div>
			</div>

			<div class="absolute left-1/2 top-[-50px] justify-center">
				<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[0, 50]} colorRange={[0, 360]} />
				<iconify-icon icon="noto:balloon" width="40" class="absolute -left-[60px] -top-[20px] text-purple-500"></iconify-icon>
				<iconify-icon icon="noto:balloon" width="50" class="absolute right-[60px] top-[20px] text-green-500"></iconify-icon>
				<iconify-icon icon="game-icons:powder" width="50" class="absolute -right-[150px] top-[220px] text-primary-500"></iconify-icon>
				<iconify-icon icon="game-icons:powder" width="30" class="absolute -right-[120px] top-[220px] -rotate-12 text-warning-500"></iconify-icon>
			</div>
			<p
				class="absolute -left-[30px] top-[170px] justify-center bg-gradient-to-br from-pink-500 to-violet-500 box-decoration-clone bg-clip-text text-4xl font-bold text-transparent"
			>
				{m.login_Happy_Holi()}
			</p>
		{/if}
		{#if isNavratri}
			<!-- Navratri -->
			<div class="absolute left-1/2 top-[-50px] justify-center">
				<iconify-icon icon="noto:prayer-beads" width="40" class="absolute -left-[100px] top-[30px]"></iconify-icon>
				<iconify-icon icon="token-branded:starl" width="40" class="absolute -right-[60px] -top-[20px]"></iconify-icon>
				<iconify-icon icon="token-branded:starl" width="60" class="absolute -right-[160px] top-[50px]"></iconify-icon>
			</div>

			<p
				class="absolute -left-[30px] top-[170px] justify-center text-nowrap bg-gradient-to-br from-pink-500 to-warning-500 box-decoration-clone bg-clip-text text-4xl font-bold text-transparent"
			>
				{m.login_happy_navratri()}
			</p>
		{/if}
	{/if}
{/if}
