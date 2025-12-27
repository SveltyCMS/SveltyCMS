<!--
@file src/components/system/icons/Seasons.svelte
@component Seasons Component

@description
Dynamically displays seasonal greetings and festival-based UI decorations based on the configured `publicEnv.SEASON_REGION`. Supports regional celebrations for Western Europe, East Asia, and South Asia, with conditional rendering of festive messages and animations.

### Props
- None (relies on global settings via `publicEnv`)

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
	import { Confetti } from 'svelte-confetti';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Settings helper
	import { publicEnv } from '@src/stores/globalSettings.svelte';

	// Use $state and $derived for reactivity in Svelte 5 runes mode
	let currentDate = $state(new Date());
	let year = $derived(currentDate.getFullYear());

	// Comments out legacy Confetti import to avoid crash
	// import { Confetti } from 'svelte-confetti';
	function isDateInRange(date: Date, start: Date, end: Date): boolean {
		return date >= start && date <= end;
	}

	// Improved Easter calculation (using Oudin's algorithm, matches existing but standardized)
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

	// =====================================================================
	// ACCURATE LUNAR FESTIVAL DATES LOOKUP TABLE
	// Pure JavaScript lunar calculations are complex and error-prone.
	// This lookup table provides accurate dates for the next 10+ years.
	// =====================================================================
	const LUNAR_FESTIVAL_DATES: Record<
		number,
		{
			chineseNewYear: string;
			dragonBoat: string;
			midAutumn: string;
			diwali: string;
			holi: string;
			navratriStart: string;
		}
	> = {
		2024: {
			chineseNewYear: '2024-02-10',
			dragonBoat: '2024-06-10',
			midAutumn: '2024-09-17',
			diwali: '2024-11-01',
			holi: '2024-03-25',
			navratriStart: '2024-10-03'
		},
		2025: {
			chineseNewYear: '2025-01-29',
			dragonBoat: '2025-05-31',
			midAutumn: '2025-10-06',
			diwali: '2025-10-20',
			holi: '2025-03-14',
			navratriStart: '2025-09-22'
		},
		2026: {
			chineseNewYear: '2026-02-17',
			dragonBoat: '2026-06-19',
			midAutumn: '2026-09-25',
			diwali: '2026-11-08',
			holi: '2026-03-04',
			navratriStart: '2026-10-12'
		},
		2027: {
			chineseNewYear: '2027-02-06',
			dragonBoat: '2027-06-09',
			midAutumn: '2027-09-15',
			diwali: '2027-10-29',
			holi: '2027-03-22',
			navratriStart: '2027-10-01'
		},
		2028: {
			chineseNewYear: '2028-01-26',
			dragonBoat: '2028-05-28',
			midAutumn: '2028-10-03',
			diwali: '2028-10-17',
			holi: '2028-03-11',
			navratriStart: '2028-09-20'
		},
		2029: {
			chineseNewYear: '2029-02-13',
			dragonBoat: '2029-06-16',
			midAutumn: '2029-09-22',
			diwali: '2029-11-05',
			holi: '2029-03-01',
			navratriStart: '2029-10-09'
		},
		2030: {
			chineseNewYear: '2030-02-03',
			dragonBoat: '2030-06-05',
			midAutumn: '2030-09-12',
			diwali: '2030-10-26',
			holi: '2030-03-20',
			navratriStart: '2030-09-29'
		},
		2031: {
			chineseNewYear: '2031-01-23',
			dragonBoat: '2031-05-25',
			midAutumn: '2031-10-01',
			diwali: '2031-10-15',
			holi: '2031-03-09',
			navratriStart: '2031-09-18'
		},
		2032: {
			chineseNewYear: '2032-02-11',
			dragonBoat: '2032-06-13',
			midAutumn: '2032-09-19',
			diwali: '2032-11-02',
			holi: '2032-02-27',
			navratriStart: '2032-10-06'
		},
		2033: {
			chineseNewYear: '2033-01-31',
			dragonBoat: '2033-06-03',
			midAutumn: '2033-09-08',
			diwali: '2033-10-23',
			holi: '2033-03-17',
			navratriStart: '2033-09-26'
		},
		2034: {
			chineseNewYear: '2034-02-19',
			dragonBoat: '2034-06-22',
			midAutumn: '2034-09-27',
			diwali: '2034-11-11',
			holi: '2034-03-06',
			navratriStart: '2034-10-15'
		},
		2035: {
			chineseNewYear: '2035-02-08',
			dragonBoat: '2035-06-11',
			midAutumn: '2035-09-16',
			diwali: '2035-10-31',
			holi: '2035-03-25',
			navratriStart: '2035-10-04'
		}
	};

	// Get festival dates from lookup table or fallback to approximations
	let festivalDates = $derived.by(() => {
		const data = LUNAR_FESTIVAL_DATES[year];
		if (data) {
			return {
				chineseNewYear: new Date(data.chineseNewYear),
				dragonBoatFestival: new Date(data.dragonBoat),
				midAutumnFestival: new Date(data.midAutumn),
				diwali: new Date(data.diwali),
				holi: new Date(data.holi),
				navratri: new Date(data.navratriStart)
			};
		}
		// Fallback for years not in lookup table (rough approximations)
		return {
			chineseNewYear: new Date(year, 0, 28), // Late January fallback
			dragonBoatFestival: new Date(year, 5, 5), // June 5 fallback
			midAutumnFestival: new Date(year, 8, 15), // Sep 15 fallback
			diwali: new Date(year, 9, 20), // Oct 20 fallback
			holi: new Date(year, 2, 10), // Mar 10 fallback
			navratri: new Date(year, 8, 28) // Sep 28 fallback
		};
	});

	// Destructure for easier access
	let chineseNewYear = $derived(festivalDates.chineseNewYear);
	let midAutumnFestival = $derived(festivalDates.midAutumnFestival);
	let dragonBoatFestival = $derived(festivalDates.dragonBoatFestival);
	let diwali = $derived(festivalDates.diwali);
	let holi = $derived(festivalDates.holi);
	let navratri = $derived(festivalDates.navratri);

	// Cherry Blossom Season (March-April, fixed by Gregorian calendar)
	function isCherryBlossomSeason(date: Date): boolean {
		const month = date.getMonth();
		return month === 2 || month === 3; // March-April
	}

	// Easter calculation (Gregorian calendar - precise)
	let easterSunday = $derived(calculateEasterSunday(year));
	let eastertideEndDate = $derived.by(() => {
		const end = new Date(easterSunday);
		end.setDate(easterSunday.getDate() + 6);
		return end;
	});

	// Festival checks as $derived
	let isNewYear = $derived(currentDate.getMonth() === 0 && currentDate.getDate() === 1);
	let isValentine = $derived(currentDate.getMonth() === 1 && currentDate.getDate() === 14);
	let isMayDay = $derived(currentDate.getMonth() === 4 && currentDate.getDate() === 1);
	let isHalloween = $derived(currentDate.getMonth() === 9 && currentDate.getDate() === 31);
	let isChristmas = $derived(currentDate.getMonth() === 11 && (currentDate.getDate() === 24 || currentDate.getDate() === 25));
	let isEaster = $derived(isDateInRange(currentDate, easterSunday, eastertideEndDate));

	let isChineseNewYear = $derived(Math.abs(currentDate.getTime() - chineseNewYear.getTime()) < 3 * 24 * 60 * 60 * 1000); // 3 days
	let isMidAutumnFestival = $derived(currentDate.toDateString() === midAutumnFestival.toDateString());
	let isDragonBoatFestival = $derived(currentDate.toDateString() === dragonBoatFestival.toDateString());
	let isCherryBlossom = $derived(isCherryBlossomSeason(currentDate));

	let isDiwali = $derived(Math.abs(currentDate.getTime() - diwali.getTime()) < 5 * 24 * 60 * 60 * 1000); // 5 days
	let isHoli = $derived(Math.abs(currentDate.getTime() - holi.getTime()) < 2 * 24 * 60 * 60 * 1000); // 2 days
	let isNavratri = $derived(Math.abs(currentDate.getTime() - navratri.getTime()) < 9 * 24 * 60 * 60 * 1000); // 9 days

	// Reactive publicEnv handling
	let seasonsEnabled = $derived(publicEnv.SEASONS === true);
	let seasonRegion = $derived(publicEnv.SEASON_REGION);
</script>

{#if seasonsEnabled}
	{#if seasonRegion === 'Western_Europe'}
		{#if isNewYear}
			<!-- New Year -->
			<div class="absolute -top-28 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
				<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[0, 50]} colorRange={[0, 120]} />
				<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[550, 550]} colorRange={[120, 240]} />
				<Confetti noGravity x={[-1, 1]} y={[-1, 1]} delay={[1000, 1050]} colorRange={[240, 360]} />
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
			<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center">
				<iconify-icon icon="noto:cherry-blossom" width="40" class="absolute -left-[60px] -top-[20px] text-pink-400"></iconify-icon>
				<iconify-icon icon="noto:cherry-blossom" width="60" class="absolute -right-[140px] top-[40px] text-pink-300"></iconify-icon>
				<iconify-icon icon="noto:white-flower" width="60" class="absolute -left-[140px] top-[40px] text-pink-300"></iconify-icon>
			</div>
		{/if}

		{#if isDragonBoatFestival}
			<!-- Dragon Boat Festival -->
			<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center">
				<iconify-icon icon="noto:dragon" width="100" class="absolute -left-[00px] -top-[35px] rotate-12"></iconify-icon>
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
				<!-- Powder effects with gradients -->
				<div class="h-full w-full translate-y-8 bg-gradient-to-b from-red-300/80 via-red-400/80 to-transparent blur-xl"></div>
				<div class="h-full w-full translate-y-12 bg-gradient-to-b from-yellow-200/80 via-yellow-300/80 to-transparent blur-xl"></div>
				<div class="h-full w-full translate-y-8 bg-gradient-to-b from-green-300/80 via-green-400/80 to-transparent blur-xl"></div>
				<div class="h-full w-full translate-y-12 bg-gradient-to-b from-cyan-300/80 via-cyan-400/80 to-transparent blur-xl"></div>
				<div class="h-full w-full translate-y-8 bg-gradient-to-b from-blue-300/80 via-blue-400/80 to-transparent blur-xl"></div>
				<div class="h-full w-full translate-y-12 bg-gradient-to-b from-purple-300/80 via-purple-400/80 to-transparent blur-xl"></div>
			</div>

			<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center">
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
			<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center">
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
