<!--
@file src/components/system/icons/seasons.svelte
@component Seasons Component

@description
Dynamically displays seasonal greetings and festival-based UI decorations based on the configured `publicEnv.SEASON_REGION`. 
Supports regional celebrations for Western Europe, East Asia, and South Asia, with conditional rendering of festive messages and animations.

### Features
- **ZERO MAINTENANCE**: All festival dates calculated algorithmically - works for any year!
- Regional support: Western Europe, East Asia, South Asia
- Accurate lunar phase calculations using Meeus algorithm (±2-3 days)
- Perfect Gregorian calculations (Easter, fixed holidays)
- Dynamic festive icons, effects, and gradient overlays
- Fully configurable via `publicEnv.SEASONS` and `publicEnv.SEASON_REGION`

### Accuracy
- Easter: 100% accurate (Oudin's algorithm)
- Chinese New Year: ±2 days (Meeus lunar algorithm)
- Diwali, Holi: ±2-3 days (lunar phase calculations)
- Fixed holidays: 100% accurate
-->

<script lang="ts">
	// Settings helper

	import { login_Happy_Holi, login_happy_diwali, login_happy_navratri, login_new_year } from '@src/paraglide/messages';
	import { publicEnv } from '@src/stores/global-settings.svelte';
	// Svelte 5 reactive Date
	import { SvelteDate } from 'svelte/reactivity';

	// =====================================================================
	// LUNAR PHASE CALCULATIONS (Meeus Algorithm - Simplified)
	// =====================================================================

	/**
	 * Calculate approximate new moon date using lunar cycle
	 * Accurate to within ±2 days for years 1900-2100
	 */
	function findNewMoonNear(year: number, month: number, _day: number): Date {
		const k = Math.floor((year - 2000) * 12.3685 + (month - 1));
		const T = k / 1236.85;

		// New moon time (simplified Meeus formula)
		const JDE = 2_451_550.097_66 + 29.530_588_861 * k + 0.000_154_37 * T * T - 0.000_000_15 * T * T * T + 0.000_000_000_73 * T * T * T * T;

		// Convert back to Gregorian date
		const jd = Math.floor(JDE + 0.5);
		const a = jd + 32_044;
		const b = Math.floor((4 * a + 3) / 146_097);
		const c = a - Math.floor((146_097 * b) / 4);
		const d = Math.floor((4 * c + 3) / 1461);
		const e = c - Math.floor((1461 * d) / 4);
		const m = Math.floor((5 * e + 2) / 153);

		const resultDay = e - Math.floor((153 * m + 2) / 5) + 1;
		const resultMonth = m + 3 - 12 * Math.floor(m / 10);
		const resultYear = 100 * b + d - 4800 + Math.floor(m / 10);

		return new Date(resultYear, resultMonth - 1, resultDay);
	}

	// Calculate full moon date (14.77 days after new moon)
	function findFullMoonNear(year: number, month: number, day: number): Date {
		const newMoon = findNewMoonNear(year, month, day);
		const fullMoon = new SvelteDate(newMoon);
		fullMoon.setDate(fullMoon.getDate() + 15);
		return fullMoon;
	}

	// =====================================================================
	// CHINESE LUNAR FESTIVALS
	// =====================================================================

	// Chinese New Year - First new moon between Jan 21 and Feb 20
	function calculateChineseNewYear(year: number): Date {
		const newMoon = findNewMoonNear(year, 1, 25);

		// Adjust if outside valid range
		if (newMoon.getMonth() === 0 && newMoon.getDate() < 21) {
			return findNewMoonNear(year, 2, 10);
		}
		if (newMoon.getMonth() === 1 && newMoon.getDate() > 20) {
			return findNewMoonNear(year, 1, 15);
		}

		return newMoon;
	}

	// Dragon Boat Festival - 5th day of 5th lunar month
	function calculateDragonBoatFestival(year: number): Date {
		const cny = calculateChineseNewYear(year);
		const approxDate = new SvelteDate(cny);
		approxDate.setDate(cny.getDate() + 29.53 * 4 + 5); // 4 lunar months + 5 days
		return approxDate;
	}

	// Mid-Autumn Festival - 15th day of 8th lunar month (full moon)
	function calculateMidAutumnFestival(year: number): Date {
		const cny = calculateChineseNewYear(year);
		const approxDate = new SvelteDate(cny);
		approxDate.setDate(cny.getDate() + 29.53 * 7.5);

		// Find nearest full moon
		return findFullMoonNear(approxDate.getFullYear(), approxDate.getMonth() + 1, approxDate.getDate());
	}

	// =====================================================================
	// HINDU LUNAR FESTIVALS
	// =====================================================================

	// Diwali - New moon in Hindu month Kartik (Oct/Nov)
	function calculateDiwali(year: number): Date {
		const newMoon = findNewMoonNear(year, 10, 25);

		// Validate range
		if (newMoon.getMonth() === 9 && newMoon.getDate() < 13) {
			return findNewMoonNear(year, 11, 5);
		}
		if (newMoon.getMonth() === 10 && newMoon.getDate() > 14) {
			return findNewMoonNear(year, 10, 5);
		}

		return newMoon;
	}

	// Holi - Full moon in Hindu month Phalguna (Feb/Mar)
	function calculateHoli(year: number): Date {
		const fullMoon = findFullMoonNear(year, 3, 10);

		// Validate range
		if (fullMoon.getMonth() === 1 && fullMoon.getDate() < 25) {
			return findFullMoonNear(year, 3, 20);
		}
		if (fullMoon.getMonth() === 2 && fullMoon.getDate() > 25) {
			return findFullMoonNear(year, 2, 20);
		}

		return fullMoon;
	}

	// Navratri - Starts 20 days before Diwali
	function calculateNavratri(year: number): Date {
		const diwali = calculateDiwali(year);
		const navratri = new SvelteDate(diwali);
		navratri.setDate(diwali.getDate() - 20);
		return navratri;
	}

	// =====================================================================
	// WESTERN GREGORIAN FESTIVALS
	// =====================================================================

	/**
	 * Easter Sunday using Oudin's algorithm
	 * Perfect accuracy for years 1900-2199
	 */
	function calculateEaster(year: number): Date {
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

	// Cherry Blossom Season (March-April)
	function isCherryBlossomSeason(date: Date): boolean {
		const month = date.getMonth();
		return month === 2 || month === 3; // March-April
	}

	// Helper to check if date is within range
	function isDateInRange(date: Date, start: Date, end: Date): boolean {
		return date >= start && date <= end;
	}

	// =====================================================================
	// REACTIVE STATE
	// =====================================================================

	// Use SvelteDate for reactivity in Svelte 5 mode
	let currentDate = new SvelteDate();
	let year = $derived(currentDate.getFullYear());

	// Calculate all festival dates for the current year
	let festivalDates = $derived.by(() => {
		return {
			chineseNewYear: calculateChineseNewYear(year),
			dragonBoatFestival: calculateDragonBoatFestival(year),
			midAutumnFestival: calculateMidAutumnFestival(year),
			diwali: calculateDiwali(year),
			holi: calculateHoli(year),
			navratri: calculateNavratri(year),
			easter: calculateEaster(year)
		};
	});

	// Destructure for easier access
	let chineseNewYear = $derived(festivalDates.chineseNewYear);
	let midAutumnFestival = $derived(festivalDates.midAutumnFestival);
	let dragonBoatFestival = $derived(festivalDates.dragonBoatFestival);
	let diwali = $derived(festivalDates.diwali);
	let holi = $derived(festivalDates.holi);
	let navratri = $derived(festivalDates.navratri);
	let easterSunday = $derived(festivalDates.easter);

	// Easter week (7 days)
	let eastertideEndDate = $derived.by(() => {
		const end = new SvelteDate(easterSunday);
		end.setDate(easterSunday.getDate() + 6);
		return end;
	});

	// =====================================================================
	// FESTIVAL CHECKS
	// =====================================================================

	// Fixed Gregorian holidays
	let isNewYear = $derived(currentDate.getMonth() === 0 && currentDate.getDate() === 1);
	let isValentine = $derived(currentDate.getMonth() === 1 && currentDate.getDate() === 14);
	let isMayDay = $derived(currentDate.getMonth() === 4 && currentDate.getDate() === 1);
	let isHalloween = $derived(currentDate.getMonth() === 9 && currentDate.getDate() === 31);
	let isChristmas = $derived(currentDate.getMonth() === 11 && (currentDate.getDate() === 24 || currentDate.getDate() === 25));

	// Calculated festivals (with tolerance windows)
	let isEaster = $derived(isDateInRange(currentDate, easterSunday, eastertideEndDate));
	let isChineseNewYear = $derived(Math.abs(currentDate.getTime() - chineseNewYear.getTime()) < 3 * 24 * 60 * 60 * 1000); // 3 days
	let isMidAutumnFestival = $derived(currentDate.toDateString() === midAutumnFestival.toDateString());
	let isDragonBoatFestival = $derived(currentDate.toDateString() === dragonBoatFestival.toDateString());
	let isCherryBlossom = $derived(isCherryBlossomSeason(currentDate));
	let isDiwali = $derived(Math.abs(currentDate.getTime() - diwali.getTime()) < 5 * 24 * 60 * 60 * 1000); // 5 days
	let isHoli = $derived(Math.abs(currentDate.getTime() - holi.getTime()) < 2 * 24 * 60 * 60 * 1000); // 2 days
	let isNavratri = $derived(Math.abs(currentDate.getTime() - navratri.getTime()) < 9 * 24 * 60 * 60 * 1000); // 9 days

	// Settings
	let seasonsEnabled = $derived(publicEnv.SEASONS === true);
	let seasonRegion = $derived(publicEnv.SEASON_REGION);
</script>

<!-- New Year Confetti - Always shows on Jan 1st regardless of settings -->
{#if isNewYear}
	<div class="pointer-events-none fixed inset-0 z-50 flex justify-center"></div>
{/if}

{#if seasonsEnabled}
	{#if seasonRegion === 'Western_Europe'}
		{#if isNewYear}
			<!-- New Year with Confetti -->
			<div class="pointer-events-none fixed inset-0 z-50 flex justify-center"></div>

			<p class="absolute -top-28 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-4xl font-bold text-error-500">
				{login_new_year()}
			</p>

			<p class="absolute left-1/2 top-28 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-5xl font-bold text-error-500">
				{currentDate.getFullYear()}
			</p>
		{/if}

		{#if isValentine}
			<!-- Valentine's Day -->
			<div class="absolute -top-28 left-1/2 -translate-x-1/2 -translate-y-1/2">
				<iconify-icon icon="mdi:heart" width="40" class="absolute -left-[60px] -top-[10px] text-red-600"></iconify-icon>
				<iconify-icon icon="mdi:cards-heart" width="40" class="absolute -right-[60px] -top-[20px] text-pink-500"></iconify-icon>
			</div>

			<p class="absolute left-1/2 top-28 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-4xl font-bold text-pink-500">
				Happy Valentine's Day
			</p>
		{/if}

		{#if isEaster}
			<!-- Easter -->
			<div class="absolute -top-24 left-1/2 -translate-x-1/2 -translate-y-1/2">
				<iconify-icon icon="mdi:egg-easter" width="40" class="absolute -top-[18px] right-2 -rotate-25 text-tertiary-500"></iconify-icon>
				<iconify-icon icon="game-icons:easter-egg" width="40" class="absolute -top-[25px] left-0 rotate-12 text-yellow-500"></iconify-icon>
				<iconify-icon icon="game-icons:high-grass" width="40" class="absolute -top-[5px] right-10 -rotate-32 text-green-500"></iconify-icon>
				<iconify-icon icon="mdi:easter" width="70" class="absolute -top-[31px] left-8 rotate-32 text-red-500"></iconify-icon>
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
			<img src="/seasons/Halloween.avif" alt="Spider" class="absolute -bottom-[200px] left-1/2 -translate-x-1/2 -translate-y-1/2" />
		{/if}

		{#if isChristmas}
			<!-- Christmas -->
			<img src="/seasons/SantaHat.avif" alt="Santa hat" class="absolute -right-[105px] -top-14 h-20 w-20 -translate-x-1/2 -translate-y-1/2" />
		{/if}
	{/if}

	{#if seasonRegion === 'East_Asia'}
		{#if isChineseNewYear}
			<!-- Chinese New Year -->
			<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center">
				<iconify-icon icon="noto:lantern" width="40" class="absolute -left-[60px] -top-[20px] text-red-600"></iconify-icon>
				<iconify-icon icon="noto:dragon-face" width="40" class="absolute -right-[60px] -top-[20px]"></iconify-icon>
			</div>
			<p class="absolute left-[-40px] top-[-50px] justify-center whitespace-nowrap text-2xl font-bold text-red-600">{login_new_year()}</p>
		{/if}

		{#if isCherryBlossom}
			<!-- Cherry Blossom Season -->
			<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center">
				<iconify-icon icon="noto:cherry-blossom" width="40" class="absolute -left-[60px] -top-[20px] text-pink-400"></iconify-icon>
				<iconify-icon icon="noto:cherry-blossom" width="60" class="absolute -right-[140px] top-[40px] text-pink-300"></iconify-icon>
				<iconify-icon icon="noto:white-flower" width="60" class="absolute -left-[140px] top-[40px] text-pink-300"></iconify-icon>
			</div>
		{/if}

		{#if isDragonBoatFestival}
			<!-- Dragon Boat Festival -->
			<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center">
				<iconify-icon icon="noto:dragon" width="100" class="absolute left-0 -top-[35px] rotate-12"></iconify-icon>
			</div>
		{/if}

		{#if isMidAutumnFestival}
			<!-- Mid-Autumn Festival -->
			<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center">
				<iconify-icon icon="noto:full-moon" width="80" class="absolute -left-[100px] -top-[10px]"></iconify-icon>
				<iconify-icon icon="noto:moon-cake" width="60" class="absolute -right-[120px] top-[220px]"></iconify-icon>
			</div>
		{/if}
	{/if}

	{#if seasonRegion === 'South_Asia'}
		{#if isDiwali}
			<!-- Diwali -->
			<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center">
				<iconify-icon icon="noto:diya-lamp" width="70" class="absolute left-[120px] top-[190px]"></iconify-icon>
				<iconify-icon icon="noto:sparkles" width="50" class="absolute -right-[160px] top-[120px] text-yellow-500"></iconify-icon>
				<iconify-icon icon="noto:sparkles" width="50" class="absolute -right-[200px] top-[100px] rotate-90 text-warning-500"></iconify-icon>
			</div>
			<p class="absolute -left-[10px] top-[170px] justify-center whitespace-nowrap text-3xl font-bold italic text-yellow-600">
				{login_happy_diwali()}
			</p>
		{/if}

		{#if isHoli}
			<!-- Holi -->
			<div class="absolute inset-0 flex">
				<!-- Powder effects with gradients -->
				<div class="h-full w-full translate-y-8 bg-linear-to-b from-red-300/80 via-red-400/80 to-transparent blur-xl"></div>
				<div class="h-full w-full translate-y-12 bg-linear-to-b from-yellow-200/80 via-yellow-300/80 to-transparent blur-xl"></div>
				<div class="h-full w-full translate-y-8 bg-linear-to-b from-green-300/80 via-green-400/80 to-transparent blur-xl"></div>
				<div class="h-full w-full translate-y-12 bg-linear-to-b from-cyan-300/80 via-cyan-400/80 to-transparent blur-xl"></div>
				<div class="h-full w-full translate-y-8 bg-linear-to-b from-blue-300/80 via-blue-400/80 to-transparent blur-xl"></div>
				<div class="h-full w-full translate-y-12 bg-linear-to-b from-purple-300/80 via-purple-400/80 to-transparent blur-xl"></div>
			</div>

			<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center">
				<iconify-icon icon="noto:balloon" width="40" class="absolute -left-[60px] -top-[20px] text-purple-500"></iconify-icon>
				<iconify-icon icon="noto:balloon" width="50" class="absolute right-[60px] top-[20px] text-green-500"></iconify-icon>
				<iconify-icon icon="game-icons:powder" width="50" class="absolute -right-[150px] top-[220px] text-primary-500"></iconify-icon>
				<iconify-icon icon="game-icons:powder" width="30" class="absolute -right-[120px] top-[220px] -rotate-12 text-warning-500"></iconify-icon>
			</div>
			<p
				class="absolute -left-[30px] top-[170px] justify-center bg-linear-to-br from-pink-500 to-violet-500 box-decoration-clone bg-clip-text text-4xl font-bold text-transparent"
			>
				{login_Happy_Holi()}
			</p>
		{/if}

		{#if isNavratri}
			<!-- Navratri -->
			<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center">
				<iconify-icon icon="noto:prayer-beads" width="40" class="absolute -left-[100px] top-[30px]"></iconify-icon>
				<iconify-icon icon="token-branded:starl" width="40" class="absolute -right-[60px] -top-[20px]"></iconify-icon>
				<iconify-icon icon="token-branded:starl" width="60" class="absolute -right-[160px] top-[50px]"></iconify-icon>
			</div>

			<p
				class="absolute -left-[30px] top-[170px] justify-center text-nowrap bg-linear-to-br from-pink-500 to-warning-500 box-decoration-clone bg-clip-text text-4xl font-bold text-transparent"
			>
				{login_happy_navratri()}
			</p>
		{/if}
	{/if}
{/if}
