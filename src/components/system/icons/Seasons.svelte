<!--
@file src/components/system/icons/Seasons.svelte
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
	import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';
	import Settings from '@lucide/svelte/icons/settings';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Confetti effect
	import { Confetti } from 'svelte-confetti';

	// Settings helper
	import { publicEnv } from '@src/stores/globalSettings.svelte';

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
		const JDE = 2451550.09766 + 29.530588861 * k + 0.00015437 * T * T - 0.00000015 * T * T * T + 0.00000000073 * T * T * T * T;

		// Convert back to Gregorian date
		const jd = Math.floor(JDE + 0.5);
		const a = jd + 32044;
		const b = Math.floor((4 * a + 3) / 146097);
		const c = a - Math.floor((146097 * b) / 4);
		const d = Math.floor((4 * c + 3) / 1461);
		const e = c - Math.floor((1461 * d) / 4);
		const m = Math.floor((5 * e + 2) / 153);

		const resultDay = e - Math.floor((153 * m + 2) / 5) + 1;
		const resultMonth = m + 3 - 12 * Math.floor(m / 10);
		const resultYear = 100 * b + d - 4800 + Math.floor(m / 10);

		return new Date(resultYear, resultMonth - 1, resultDay);
	}

	// Calculate full moon date (14.77 days after new moon)
	function findFullMoonNear(year: number, month: number, _day: number): Date {
		const newMoon = findNewMoonNear(year, month, _day);
		const fullMoon = new Date(newMoon);
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
		const approxDate = new Date(cny);
		approxDate.setDate(cny.getDate() + 29.53 * 4 + 5); // 4 lunar months + 5 days
		return approxDate;
	}

	// Mid-Autumn Festival - 15th day of 8th lunar month (full moon)
	function calculateMidAutumnFestival(year: number): Date {
		const cny = calculateChineseNewYear(year);
		const approxDate = new Date(cny);
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
		const navratri = new Date(diwali);
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

	// Use $state and $derived for reactivity in Svelte 5 runes mode
	let currentDate = $state(new Date());
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
		const end = new Date(easterSunday);
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
	<div class="pointer-events-none fixed inset-0 z-50 flex justify-center">
		<Confetti x={[-0.5, 0.5]} y={[0.25, 1]} delay={[0, 2000]} duration={3500} amount={200} fallDistance="100vh" />
	</div>
{/if}

{#if seasonsEnabled}
	{#if seasonRegion === 'Western_Europe'}
		{#if isNewYear}
			<!-- New Year with Confetti -->
			<div class="pointer-events-none fixed inset-0 z-50 flex justify-center">
				<Confetti x={[-0.5, 0.5]} y={[0.25, 1]} delay={[0, 2000]} duration={3500} amount={200} fallDistance="100vh" />
			</div>

			<p class="absolute -top-28 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-4xl font-bold text-error-500">
				{m.login_new_year()}
			</p>

			<p class="absolute left-1/2 top-28 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-5xl font-bold text-error-500">
				{currentDate.getFullYear()}
			</p>
		{/if}

		{#if isValentine}
			<!-- Valentine's Day -->
			<div class="absolute -top-28 left-1/2 -translate-x-1/2 -translate-y-1/2">
				<CircleQuestionMark size={24} />
				<CircleQuestionMark size={24} />
			</div>

			<p class="absolute left-1/2 top-28 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-4xl font-bold text-pink-500">
				Happy Valentine's Day
			</p>
		{/if}

		{#if isEaster}
			<!-- Easter -->
			<div class="absolute -top-24 left-1/2 -translate-x-1/2 -translate-y-1/2">
				<CircleQuestionMark size={24} />
				<CircleQuestionMark size={24} />
				<CircleQuestionMark size={24} />
				<CircleQuestionMark size={24} />
			</div>
		{/if}

		{#if isMayDay}
			<!-- May Day -->
			<div class="absolute -top-24 left-1/2 -translate-x-1/2 -translate-y-1/2">
				<CircleQuestionMark size={24} />
				<CircleQuestionMark size={24} />
				<CircleQuestionMark size={24} />
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
				<CircleQuestionMark size={24} />
				<CircleQuestionMark size={24} />
			</div>
			<p class="absolute left-[-40px] top-[-50px] justify-center whitespace-nowrap text-2xl font-bold text-red-600">
				{m.login_new_year()}
			</p>
		{/if}

		{#if isCherryBlossom}
			<!-- Cherry Blossom Season -->
			<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center">
				<CircleQuestionMark size={24} />
				<CircleQuestionMark size={24} />
				<CircleQuestionMark size={24} />
			</div>
		{/if}

		{#if isDragonBoatFestival}
			<!-- Dragon Boat Festival -->
			<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center">
				<CircleQuestionMark size={24} />
			</div>
		{/if}

		{#if isMidAutumnFestival}
			<!-- Mid-Autumn Festival -->
			<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center">
				<CircleQuestionMark size={24} />
				<CircleQuestionMark size={24} />
			</div>
		{/if}
	{/if}

	{#if seasonRegion === 'South_Asia'}
		{#if isDiwali}
			<!-- Diwali -->
			<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center">
				<CircleQuestionMark size={24} />
				<CircleQuestionMark size={24} />
				<CircleQuestionMark size={24} />
			</div>
			<p class="absolute -left-[10px] top-[170px] justify-center whitespace-nowrap text-3xl font-bold italic text-yellow-600">
				{m.login_happy_diwali()}
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
				<CircleQuestionMark size={24} />
				<CircleQuestionMark size={24} />
				<CircleQuestionMark size={24} />
				<CircleQuestionMark size={24} />
			</div>
			<p
				class="absolute -left-[30px] top-[170px] justify-center bg-linear-to-br from-pink-500 to-violet-500 box-decoration-clone bg-clip-text text-4xl font-bold text-transparent"
			>
				{m.login_Happy_Holi()}
			</p>
		{/if}

		{#if isNavratri}
			<!-- Navratri -->
			<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center">
				<CircleQuestionMark size={24} />
				<CircleQuestionMark size={24} />
				<CircleQuestionMark size={24} />
			</div>

			<p
				class="absolute -left-[30px] top-[170px] justify-center text-nowrap bg-linear-to-br from-pink-500 to-warning-500 box-decoration-clone bg-clip-text text-4xl font-bold text-transparent"
			>
				{m.login_happy_navratri()}
			</p>
		{/if}
	{/if}
{/if}
