import {
	a as attr,
	g as attr_class,
	i as clsx,
	d as escape_html,
	b as attr_style,
	c as stringify,
	e as ensure_array_like,
	h as bind_props
} from '../../../chunks/index5.js';
import { publicEnv, getPublicSetting } from '../../../chunks/globalSettings.svelte.js';
import 'clsx';
import {
	aK as login_new_year,
	aL as login_happy_diwali,
	aM as login_happy_holi2,
	aN as login_happy_navratri,
	aO as form_signin,
	aP as signin_forgottontoast,
	aQ as signin_forgottenpassword,
	aR as form_resetpassword,
	aS as form_required,
	aH as email,
	aI as form_password,
	aT as twofa_verify_title,
	aU as twofa_verify_description,
	aV as twofa_code_placeholder,
	aW as twofa_use_backup_code,
	aX as button_back,
	aY as twofa_verify_button,
	aZ as confirm_password,
	a_ as form_confirmpassword,
	D as registration_token,
	a$ as signin_registrationtoken,
	b0 as signin_savenewpassword,
	b1 as form_signup,
	aG as username,
	E as signup_registrationtoken,
	b2 as db_error_title,
	b3 as db_error_description,
	b4 as db_error_reason_label,
	b5 as db_error_solutions_title,
	b6 as db_error_solution_1,
	b7 as db_error_solution_2,
	b8 as db_error_solution_3,
	b9 as db_error_solution_4,
	ba as db_error_reset_setup,
	bb as db_error_refresh_page,
	bc as login_demo_title,
	bd as login_demo_message,
	be as login_demo_nextreset,
	bf as applayout_systemlanguage
} from '../../../chunks/_index.js';
import { S as SveltyCMS_LogoFull } from '../../../chunks/SveltyCMS_LogoFull.js';
import { g as goto } from '../../../chunks/client2.js';
import { p as page } from '../../../chunks/index6.js';
import { safeParse, flatten } from 'valibot';
import { l as loginFormSchema, f as forgotFormSchema, r as resetFormSchema, s as signUpFormSchema } from '../../../chunks/formSchemas.js';
import { a as SveltyCMS_Logo, S as SiteName } from '../../../chunks/SveltyCMS_Logo.js';
import { F as FloatingInput } from '../../../chunks/floatingInput.js';
import { t as toaster, s as systemLanguage } from '../../../chunks/store.svelte.js';
import '@sveltejs/kit/internal';
import '../../../chunks/exports.js';
import '../../../chunks/utils3.js';
import '@sveltejs/kit/internal/server';
import '../../../chunks/state.svelte.js';
import { s as screen } from '../../../chunks/screenSizeStore.svelte.js';
import { g as globalLoadingStore, l as loadingOperations } from '../../../chunks/loadingStore.svelte.js';
import '../../../chunks/logger.js';
import { o as onDestroy } from '../../../chunks/index-server.js';
import { g as getLanguageName } from '../../../chunks/languageUtils.js';
import { l as locales } from '../../../chunks/runtime.js';
import { M as Menu } from '../../../chunks/anatomy4.js';
import { P as Portal } from '../../../chunks/anatomy.js';
function VersionCheck($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { transparent = false, compact = false, children } = $$props;
		const GITHUB_RELEASES_URL = 'https://github.com/SveltyCMS/SveltyCMS/releases';
		const pkg = publicEnv?.PKG_VERSION || '0.0.0';
		let githubVersion = '';
		let badgeVariant = 'variant-filled';
		let badgeColor = 'bg-primary-500 text-white';
		let versionStatusMessage = 'Checking for updates...';
		let statusIcon = 'mdi:loading';
		let statusSeverity = 'unknown';
		let isLoading = true;
		let error = null;
		let lastChecked = null;
		const versionStatus = {
			pkg,
			githubVersion,
			badgeVariant,
			badgeColor,
			versionStatusMessage,
			statusIcon,
			statusSeverity,
			isLoading,
			error,
			lastChecked
		};
		const isLoginRoute = false;
		const effectiveTransparent = transparent || isLoginRoute;
		const transparentClasses = (() => {
			if (badgeColor.includes('success')) {
				return 'bg-success-500/20 text-success-700 dark:text-success-300';
			} else if (badgeColor.includes('warning')) {
				return 'bg-warning-500/20 text-warning-700 dark:text-warning-300';
			} else if (badgeColor.includes('error')) {
				return 'bg-error-500/20 text-black';
			}
			return 'bg-surface-900/10 dark:text-white';
		})();
		onDestroy(() => {});
		const statusAriaLabel = (() => {
			{
				return 'Checking application version';
			}
		})();
		if (children) {
			$$renderer2.push('<!--[-->');
			children($$renderer2, versionStatus);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(
				`<a${attr('href', GITHUB_RELEASES_URL)} target="_blank" rel="noopener noreferrer"${attr_class(clsx(effectiveTransparent ? `absolute bottom-5 left-1/2 flex -translate-x-1/2 transform items-center justify-between w-28 gap-2 rounded-full ${transparentClasses} px-4 py-1 text-sm font-bold transition-opacity duration-300 hover:opacity-90  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2` : compact ? `inline-flex items-center gap-1 text-xs font-medium transition-colors hover:opacity-80 focus:opacity-80 badge ${badgeVariant} ${badgeColor} rounded-full px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-primary-500` : `inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-80 focus:opacity-80 badge ${badgeVariant} ${badgeColor} rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500`))}${attr('aria-label', statusAriaLabel)} aria-live="polite">`
			);
			if (effectiveTransparent) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`<span class="text-black">Ver.</span> <span class="text-white">${escape_html(pkg)}</span> `);
				{
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]-->`);
			} else {
				$$renderer2.push('<!--[!-->');
				$$renderer2.push(`<span>`);
				if (compact) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(`v.${escape_html(pkg)}`);
				} else {
					$$renderer2.push('<!--[!-->');
					$$renderer2.push(`Ver. ${escape_html(pkg)} `);
					{
						$$renderer2.push('<!--[!-->');
					}
					$$renderer2.push(`<!--]-->`);
				}
				$$renderer2.push(`<!--]--></span> `);
				{
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]-->`);
			}
			$$renderer2.push(`<!--]--> `);
			if (!compact && !effectiveTransparent) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`<span class="sr-only">${escape_html(versionStatusMessage)}</span>`);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--></a> `);
			{
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]-->`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function Confetti($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const {
			size = 10,
			x = [-0.5, 0.5],
			y = [0.25, 1],
			duration = 2e3,
			infinite = false,
			delay = [0, 50],
			colorRange = [0, 360],
			colorArray = [],
			amount = 50,
			iterationCount = 1,
			fallDistance = '100px',
			rounded = false,
			cone = false,
			noGravity = false,
			xSpread = 0.15,
			destroyOnComplete = true,
			disableForReducedMotion = false
		} = $$props;
		function randomBetween(min, max) {
			return Math.random() * (max - min) + min;
		}
		function getColor() {
			if (colorArray.length) return colorArray[Math.round(Math.random() * (colorArray.length - 1))];
			else return `hsl(${Math.round(randomBetween(colorRange[0], colorRange[1]))}, 75%, 50%)`;
		}
		{
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div${attr_class('confetti-holder svelte-apss0', void 0, {
					rounded: rounded,
					cone: cone,
					'no-gravity': noGravity,
					'reduced-motion': disableForReducedMotion
				})}${attr_style(` --fall-distance: ${stringify(fallDistance)}; --size: ${stringify(size)}px; --x-spread: ${stringify(1 - xSpread)}; --transition-iteration-count: ${stringify(infinite ? 'infinite' : iterationCount)};`)}><!--[-->`
			);
			const each_array = ensure_array_like({ length: amount });
			for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
				each_array[$$index];
				$$renderer2.push(
					`<div class="confetti svelte-apss0"${attr_style(` --color: ${stringify(getColor())}; --skew: ${stringify(randomBetween(-45, 45))}deg,${stringify(randomBetween(-45, 45))}deg; --rotation-xyz: ${stringify(randomBetween(-10, 10))}, ${stringify(randomBetween(-10, 10))}, ${stringify(randomBetween(-10, 10))}; --rotation-deg: ${stringify(randomBetween(0, 360))}deg; --translate-y-multiplier: ${stringify(randomBetween(y[0], y[1]))}; --translate-x-multiplier: ${stringify(randomBetween(x[0], x[1]))}; --scale: ${stringify(0.1 * randomBetween(2, 10))}; --transition-delay: ${stringify(randomBetween(delay[0], delay[1]))}ms; --transition-duration: ${stringify(infinite ? `calc(${duration}ms * var(--scale))` : `${duration}ms`)};`)}></div>`
				);
			}
			$$renderer2.push(`<!--]--></div>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function Seasons($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		function findNewMoonNear(year2, month, _day) {
			const k = Math.floor((year2 - 2e3) * 12.3685 + (month - 1));
			const T = k / 1236.85;
			const JDE = 245155009766e-5 + 29.530588861 * k + 15437e-8 * T * T - 15e-8 * T * T * T + 73e-11 * T * T * T * T;
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
		function findFullMoonNear(year2, month, _day) {
			const newMoon = findNewMoonNear(year2, month);
			const fullMoon = new Date(newMoon);
			fullMoon.setDate(fullMoon.getDate() + 15);
			return fullMoon;
		}
		function calculateChineseNewYear(year2) {
			const newMoon = findNewMoonNear(year2, 1);
			if (newMoon.getMonth() === 0 && newMoon.getDate() < 21) {
				return findNewMoonNear(year2, 2);
			}
			if (newMoon.getMonth() === 1 && newMoon.getDate() > 20) {
				return findNewMoonNear(year2, 1);
			}
			return newMoon;
		}
		function calculateDragonBoatFestival(year2) {
			const cny = calculateChineseNewYear(year2);
			const approxDate = new Date(cny);
			approxDate.setDate(cny.getDate() + 29.53 * 4 + 5);
			return approxDate;
		}
		function calculateMidAutumnFestival(year2) {
			const cny = calculateChineseNewYear(year2);
			const approxDate = new Date(cny);
			approxDate.setDate(cny.getDate() + 29.53 * 7.5);
			return findFullMoonNear(approxDate.getFullYear(), approxDate.getMonth() + 1, approxDate.getDate());
		}
		function calculateDiwali(year2) {
			const newMoon = findNewMoonNear(year2, 10);
			if (newMoon.getMonth() === 9 && newMoon.getDate() < 13) {
				return findNewMoonNear(year2, 11);
			}
			if (newMoon.getMonth() === 10 && newMoon.getDate() > 14) {
				return findNewMoonNear(year2, 10);
			}
			return newMoon;
		}
		function calculateHoli(year2) {
			const fullMoon = findFullMoonNear(year2, 3);
			if (fullMoon.getMonth() === 1 && fullMoon.getDate() < 25) {
				return findFullMoonNear(year2, 3);
			}
			if (fullMoon.getMonth() === 2 && fullMoon.getDate() > 25) {
				return findFullMoonNear(year2, 2);
			}
			return fullMoon;
		}
		function calculateNavratri(year2) {
			const diwali2 = calculateDiwali(year2);
			const navratri2 = new Date(diwali2);
			navratri2.setDate(diwali2.getDate() - 20);
			return navratri2;
		}
		function calculateEaster(year2) {
			const f = Math.floor;
			const G = year2 % 19;
			const C = f(year2 / 100);
			const H = (C - f(C / 4) - f((8 * C + 13) / 25) + 19 * G + 15) % 30;
			const I = H - f(H / 28) * (1 - f(29 / (H + 1)) * f((21 - G) / 11));
			const J = (year2 + f(year2 / 4) + I + 2 - C + f(C / 4)) % 7;
			const L = I - J;
			const month = 3 + f((L + 40) / 44);
			const day = L + 28 - 31 * f(month / 4);
			return new Date(year2, month - 1, day);
		}
		function isCherryBlossomSeason(date) {
			const month = date.getMonth();
			return month === 2 || month === 3;
		}
		function isDateInRange(date, start, end) {
			return date >= start && date <= end;
		}
		let currentDate = /* @__PURE__ */ new Date();
		let year = currentDate.getFullYear();
		let festivalDates = (() => {
			return {
				chineseNewYear: calculateChineseNewYear(year),
				dragonBoatFestival: calculateDragonBoatFestival(year),
				midAutumnFestival: calculateMidAutumnFestival(year),
				diwali: calculateDiwali(year),
				holi: calculateHoli(year),
				navratri: calculateNavratri(year),
				easter: calculateEaster(year)
			};
		})();
		let chineseNewYear = festivalDates.chineseNewYear;
		let midAutumnFestival = festivalDates.midAutumnFestival;
		let dragonBoatFestival = festivalDates.dragonBoatFestival;
		let diwali = festivalDates.diwali;
		let holi = festivalDates.holi;
		let navratri = festivalDates.navratri;
		let easterSunday = festivalDates.easter;
		let eastertideEndDate = (() => {
			const end = new Date(easterSunday);
			end.setDate(easterSunday.getDate() + 6);
			return end;
		})();
		let isNewYear = currentDate.getMonth() === 0 && currentDate.getDate() === 1;
		let isValentine = currentDate.getMonth() === 1 && currentDate.getDate() === 14;
		let isMayDay = currentDate.getMonth() === 4 && currentDate.getDate() === 1;
		let isHalloween = currentDate.getMonth() === 9 && currentDate.getDate() === 31;
		let isChristmas = currentDate.getMonth() === 11 && (currentDate.getDate() === 24 || currentDate.getDate() === 25);
		let isEaster = isDateInRange(currentDate, easterSunday, eastertideEndDate);
		let isChineseNewYear = Math.abs(currentDate.getTime() - chineseNewYear.getTime()) < 3 * 24 * 60 * 60 * 1e3;
		let isMidAutumnFestival = currentDate.toDateString() === midAutumnFestival.toDateString();
		let isDragonBoatFestival = currentDate.toDateString() === dragonBoatFestival.toDateString();
		let isCherryBlossom = isCherryBlossomSeason(currentDate);
		let isDiwali = Math.abs(currentDate.getTime() - diwali.getTime()) < 5 * 24 * 60 * 60 * 1e3;
		let isHoli = Math.abs(currentDate.getTime() - holi.getTime()) < 2 * 24 * 60 * 60 * 1e3;
		let isNavratri = Math.abs(currentDate.getTime() - navratri.getTime()) < 9 * 24 * 60 * 60 * 1e3;
		let seasonsEnabled = publicEnv.SEASONS === true;
		let seasonRegion = publicEnv.SEASON_REGION;
		if (isNewYear) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<div class="pointer-events-none fixed inset-0 z-50 flex justify-center">`);
			Confetti($$renderer2, {
				x: [-0.5, 0.5],
				y: [0.25, 1],
				delay: [0, 2e3],
				duration: 3500,
				amount: 200,
				fallDistance: '100vh'
			});
			$$renderer2.push(`<!----></div>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		if (seasonsEnabled) {
			$$renderer2.push('<!--[-->');
			if (seasonRegion === 'Western_Europe') {
				$$renderer2.push('<!--[-->');
				if (isNewYear) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(`<div class="pointer-events-none fixed inset-0 z-50 flex justify-center">`);
					Confetti($$renderer2, {
						x: [-0.5, 0.5],
						y: [0.25, 1],
						delay: [0, 2e3],
						duration: 3500,
						amount: 200,
						fallDistance: '100vh'
					});
					$$renderer2.push(
						`<!----></div> <p class="absolute -top-28 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-4xl font-bold text-error-500">${escape_html(login_new_year())}</p> <p class="absolute left-1/2 top-28 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-5xl font-bold text-error-500">${escape_html(currentDate.getFullYear())}</p>`
					);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--> `);
				if (isValentine) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<div class="absolute -top-28 left-1/2 -translate-x-1/2 -translate-y-1/2"><iconify-icon icon="mdi:heart" width="40" class="absolute -left-[60px] -top-[10px] text-red-600"></iconify-icon> <iconify-icon icon="mdi:cards-heart" width="40" class="absolute -right-[60px] -top-[20px] text-pink-500"></iconify-icon></div> <p class="absolute left-1/2 top-28 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-4xl font-bold text-pink-500">Happy Valentine's Day</p>`
					);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--> `);
				if (isEaster) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<div class="absolute -top-24 left-1/2 -translate-x-1/2 -translate-y-1/2"><iconify-icon icon="mdi:egg-easter" width="40" class="absolute -top-[18px] right-2 -rotate-25 text-tertiary-500"></iconify-icon> <iconify-icon icon="game-icons:easter-egg" width="40" class="absolute -top-[25px] left-0 rotate-12 text-yellow-500"></iconify-icon> <iconify-icon icon="game-icons:high-grass" width="40" class="absolute -top-[5px] right-10 -rotate-32 text-green-500"></iconify-icon> <iconify-icon icon="mdi:easter" width="70" class="absolute -top-[31px] left-8 rotate-32 text-red-500"></iconify-icon></div>`
					);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--> `);
				if (isMayDay) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<div class="absolute -top-24 left-1/2 -translate-x-1/2 -translate-y-1/2"><iconify-icon icon="noto:tulip" width="60" class="absolute -left-[16px] -top-[45px] rotate-12"></iconify-icon> <iconify-icon icon="fluent-emoji:tulip" width="40" class="absolute -top-[14px] right-[20px] -rotate-12"></iconify-icon> <iconify-icon icon="noto:sunflower" width="50" class="absolute -top-[16px] left-10 rotate-6"></iconify-icon></div>`
					);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--> `);
				if (isHalloween) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<img src="/seasons/Halloween.avif" alt="Spider" class="absolute -bottom-[200px] left-1/2 -translate-x-1/2 -translate-y-1/2"/>`
					);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--> `);
				if (isChristmas) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<img src="/seasons/SantaHat.avif" alt="Santa hat" class="absolute -right-[105px] -top-14 h-20 w-20 -translate-x-1/2 -translate-y-1/2"/>`
					);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]-->`);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--> `);
			if (seasonRegion === 'East_Asia') {
				$$renderer2.push('<!--[-->');
				if (isChineseNewYear) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center"><iconify-icon icon="noto:lantern" width="40" class="absolute -left-[60px] -top-[20px] text-red-600"></iconify-icon> <iconify-icon icon="noto:dragon-face" width="40" class="absolute -right-[60px] -top-[20px]"></iconify-icon></div> <p class="absolute left-[-40px] top-[-50px] justify-center whitespace-nowrap text-2xl font-bold text-red-600">${escape_html(login_new_year())}</p>`
					);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--> `);
				if (isCherryBlossom) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center"><iconify-icon icon="noto:cherry-blossom" width="40" class="absolute -left-[60px] -top-[20px] text-pink-400"></iconify-icon> <iconify-icon icon="noto:cherry-blossom" width="60" class="absolute -right-[140px] top-[40px] text-pink-300"></iconify-icon> <iconify-icon icon="noto:white-flower" width="60" class="absolute -left-[140px] top-[40px] text-pink-300"></iconify-icon></div>`
					);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--> `);
				if (isDragonBoatFestival) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center"><iconify-icon icon="noto:dragon" width="100" class="absolute left-0 -top-[35px] rotate-12"></iconify-icon></div>`
					);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--> `);
				if (isMidAutumnFestival) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center"><iconify-icon icon="noto:full-moon" width="80" class="absolute -left-[100px] -top-[10px]"></iconify-icon> <iconify-icon icon="noto:moon-cake" width="60" class="absolute -right-[120px] top-[220px]"></iconify-icon></div>`
					);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]-->`);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--> `);
			if (seasonRegion === 'South_Asia') {
				$$renderer2.push('<!--[-->');
				if (isDiwali) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center"><iconify-icon icon="noto:diya-lamp" width="70" class="absolute left-[120px] top-[190px]"></iconify-icon> <iconify-icon icon="noto:sparkles" width="50" class="absolute -right-[160px] top-[120px] text-yellow-500"></iconify-icon> <iconify-icon icon="noto:sparkles" width="50" class="absolute -right-[200px] top-[100px] rotate-90 text-warning-500"></iconify-icon></div> <p class="absolute -left-[10px] top-[170px] justify-center whitespace-nowrap text-3xl font-bold italic text-yellow-600">${escape_html(login_happy_diwali())}</p>`
					);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--> `);
				if (isHoli) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<div class="absolute inset-0 flex"><div class="h-full w-full translate-y-8 bg-linear-to-b from-red-300/80 via-red-400/80 to-transparent blur-xl"></div> <div class="h-full w-full translate-y-12 bg-linear-to-b from-yellow-200/80 via-yellow-300/80 to-transparent blur-xl"></div> <div class="h-full w-full translate-y-8 bg-linear-to-b from-green-300/80 via-green-400/80 to-transparent blur-xl"></div> <div class="h-full w-full translate-y-12 bg-linear-to-b from-cyan-300/80 via-cyan-400/80 to-transparent blur-xl"></div> <div class="h-full w-full translate-y-8 bg-linear-to-b from-blue-300/80 via-blue-400/80 to-transparent blur-xl"></div> <div class="h-full w-full translate-y-12 bg-linear-to-b from-purple-300/80 via-purple-400/80 to-transparent blur-xl"></div></div> <div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center"><iconify-icon icon="noto:balloon" width="40" class="absolute -left-[60px] -top-[20px] text-purple-500"></iconify-icon> <iconify-icon icon="noto:balloon" width="50" class="absolute right-[60px] top-[20px] text-green-500"></iconify-icon> <iconify-icon icon="game-icons:powder" width="50" class="absolute -right-[150px] top-[220px] text-primary-500"></iconify-icon> <iconify-icon icon="game-icons:powder" width="30" class="absolute -right-[120px] top-[220px] -rotate-12 text-warning-500"></iconify-icon></div> <p class="absolute -left-[30px] top-[170px] justify-center bg-linear-to-br from-pink-500 to-violet-500 box-decoration-clone bg-clip-text text-4xl font-bold text-transparent">${escape_html(login_happy_holi2())}</p>`
					);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--> `);
				if (isNavratri) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center"><iconify-icon icon="noto:prayer-beads" width="40" class="absolute -left-[100px] top-[30px]"></iconify-icon> <iconify-icon icon="token-branded:starl" width="40" class="absolute -right-[60px] -top-[20px]"></iconify-icon> <iconify-icon icon="token-branded:starl" width="60" class="absolute -right-[160px] top-[50px]"></iconify-icon></div> <p class="absolute -left-[30px] top-[170px] justify-center text-nowrap bg-linear-to-br from-pink-500 to-warning-500 box-decoration-clone bg-clip-text text-4xl font-bold text-transparent">${escape_html(login_happy_navratri())}</p>`
					);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]-->`);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]-->`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]-->`);
	});
}
class Form {
	constructor(initialData, schema) {
		this.schema = schema;
		this.data = { ...initialData };
	}
	data = {};
	errors = {};
	submitting = false;
	message = void 0;
	// Helper to reset form
	reset(newData) {
		if (newData) {
			this.data = { ...newData };
		}
		this.errors = {};
		this.message = void 0;
		this.submitting = false;
	}
	// Validate form data against schema
	validate() {
		this.errors = {};
		this.message = void 0;
		if (this.schema) {
			const result = safeParse(this.schema, this.data);
			if (!result.success) {
				const flatErrors = flatten(result.issues).nested;
				this.errors = flatErrors;
				return false;
			}
		}
		return true;
	}
	// Enhance action for SvelteKit forms
	enhance(options) {
		return (input) => {
			this.submitting = true;
			this.message = void 0;
			this.errors = {};
			if (options?.onSubmit) {
				options.onSubmit(input);
			}
			if (this.schema) {
				const result = safeParse(this.schema, this.data);
				if (!result.success) {
					const flatErrors = flatten(result.issues).nested;
					this.errors = flatErrors;
					this.submitting = false;
					input.cancel();
					return;
				}
			}
			return async (resultInput) => {
				const { result, update } = resultInput;
				this.submitting = false;
				if (result.type === 'failure') {
					if (result.data?.errors) {
						this.errors = result.data.errors;
					}
					if (result.data?.message) {
						this.message = result.data.message;
					}
				} else if (result.type === 'success') {
					if (result.data?.message) {
						this.message = result.data.message;
					}
				}
				if (options?.onResult) {
					await options.onResult(resultInput);
				} else {
					await update();
				}
			};
		};
	}
	// Manual submit handler for standard API endpoints
	async submit(url, options = {}) {
		this.submitting = true;
		this.message = void 0;
		this.errors = {};
		if (this.schema) {
			const result = safeParse(this.schema, this.data);
			if (!result.success) {
				const flatErrors = flatten(result.issues).nested;
				this.errors = flatErrors;
				this.submitting = false;
				return { success: false, errors: this.errors };
			}
		}
		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				...options,
				body: JSON.stringify(this.data)
			});
			const data = await response.json();
			if (!response.ok) {
				this.errors = data.errors || {};
				this.message = data.message || 'An error occurred';
				return { success: false, data };
			}
			this.message = data.message;
			return { success: true, data };
		} catch (error) {
			this.message = error instanceof Error ? error.message : 'Network error';
			return { success: false, error };
		} finally {
			this.submitting = false;
		}
	}
}
function SigninIcon($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { show = true, disabled = false, onClick = (_event) => {} } = $$props;
		$$renderer2.push(
			`<div${attr_class(
				'icon dark:text-dark absolute left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] transition-all duration-300 svelte-23owe9',
				void 0,
				{
					hide: !show,
					'pointer-events-none': !show || disabled,
					'opacity-50': disabled
				}
			)}><div role="button"${attr('tabindex', disabled ? -1 : 0)} class="flex cursor-pointer flex-col items-center"><div class="relative w-max rounded-full border-4 border-[#2b2f31] p-3"><svg class="aspect-square h-12 fill-[#2b2f31]" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 50 50"><path d="M25 3C19.464844 3 15 7.464844 15 13L15 19C15 22.238281 16.585938 25.144531 19 26.96875L19 31.5C19 31.605469 18.980469 31.695313 18.71875 31.9375C18.457031 32.179688 17.992188 32.503906 17.375 32.8125C16.144531 33.429688 14.367188 34.0625 12.5625 34.9375C10.757813 35.8125 8.886719 36.925781 7.4375 38.53125C5.988281 40.136719 5 42.289063 5 45L5 46L45 46L45 45C45 42.265625 44.011719 40.105469 42.5625 38.5C41.113281 36.894531 39.242188 35.800781 37.4375 34.9375C35.632813 34.074219 33.851563 33.421875 32.625 32.8125C32.011719 32.507813 31.539063 32.210938 31.28125 31.96875C31.023438 31.726563 31 31.625 31 31.5L31 26.96875C33.414063 25.144531 35 22.238281 35 19L35 13C35 7.464844 30.535156 3 25 3 Z M 25 5C29.464844 5 33 8.535156 33 13L33 19C33 21.757813 31.558594 24.242188 29.4375 25.65625L29 25.96875L29 31.5C29 32.273438 29.398438 32.957031 29.90625 33.4375C30.414063 33.917969 31.050781 34.277344 31.75 34.625C33.148438 35.320313 34.867188 35.9375 36.5625 36.75C38.257813 37.5625 39.886719 38.542969 41.0625 39.84375C42.039063 40.921875 42.605469 42.304688 42.8125 44L7.1875 44C7.394531 42.324219 7.964844 40.957031 8.9375 39.875C10.113281 38.570313 11.742188 37.574219 13.4375 36.75C15.132813 35.925781 16.855469 35.289063 18.25 34.59375C18.945313 34.246094 19.589844 33.878906 20.09375 33.40625C20.597656 32.933594 21 32.269531 21 31.5L21 25.96875L20.5625 25.65625C18.441406 24.242188 17 21.757813 17 19L17 13C17 8.535156 20.535156 5 25 5Z"></path></svg></div> <p class="text-center font-semibold uppercase text-black!">${escape_html(form_signin())}</p></div></div>`
		);
		bind_props($$props, { show });
	});
}
function PasswordStrength($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { password = '', confirmPassword = '', showRequirements = false } = $$props;
		const MIN_PASSWORD_LENGTH = publicEnv?.PASSWORD_LENGTH ?? 8;
		const YELLOW_LENGTH = MIN_PASSWORD_LENGTH + 3;
		const GREEN_LENGTH = YELLOW_LENGTH + 4;
		let showRequirementsList = false;
		const complexityChecks = (() => {
			const pwd = longerPassword;
			return {
				hasUpper: /[A-Z]/.test(pwd),
				hasLower: /[a-z]/.test(pwd),
				hasNumber: /\d/.test(pwd),
				hasSpecial: /[^A-Za-z0-9]/.test(pwd),
				hasMinLength: pwd.length >= MIN_PASSWORD_LENGTH
			};
		})();
		function calculateScore(pwd, checks) {
			if (pwd.length === 0) return 0;
			let score2 = 0;
			if (pwd.length >= MIN_PASSWORD_LENGTH && pwd.length < YELLOW_LENGTH) score2 = 1;
			else if (pwd.length >= YELLOW_LENGTH && pwd.length < GREEN_LENGTH) score2 = 2;
			else if (pwd.length >= GREEN_LENGTH) score2 = 3;
			const complexityCount = Object.entries(checks).filter(([key, value]) => key !== 'hasMinLength' && value).length;
			score2 += Math.floor(complexityCount / 2);
			return Math.min(score2, 5);
		}
		const FEEDBACK_MESSAGES = {
			0: 'Too Short',
			1: 'Weak',
			2: 'Fair',
			3: 'Good',
			4: 'Strong',
			5: 'Very Strong'
		};
		const COLOR_CLASSES = {
			0: 'bg-gray-300 text-gray-700 dark:bg-gray-600 dark:text-gray-300',
			1: 'bg-red-500 text-white',
			2: 'bg-orange-500 text-white',
			3: 'bg-yellow-500 text-gray-900',
			4: 'bg-green-600 text-white',
			5: 'bg-green-500 text-white'
		};
		function getBarColor(barIndex, score2) {
			if (score2 === 0) return 'bg-gray-200 dark:bg-gray-700';
			if (barIndex === 0) return score2 >= 1 ? 'bg-red-500' : 'bg-gray-200 dark:bg-gray-700';
			if (barIndex === 1) return score2 >= 2 ? 'bg-yellow-500' : 'bg-gray-200 dark:bg-gray-700';
			return score2 >= 3 ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700';
		}
		const longerPassword = password.length >= confirmPassword.length ? password : confirmPassword;
		const score = calculateScore(longerPassword, complexityChecks);
		const feedback = FEEDBACK_MESSAGES[score] || 'Unknown';
		const scoreColor = COLOR_CLASSES[score] || COLOR_CLASSES[0];
		const showStrength = password.length > 0 || confirmPassword.length > 0;
		const percentage = Math.min(100, (longerPassword.length / GREEN_LENGTH) * 100);
		const passwordsMatch = password === confirmPassword && confirmPassword.length > 0 && password.length > 0;
		const showMatchIndicator = confirmPassword.length > 0;
		const metRequirements = Object.values(complexityChecks).filter(Boolean).length;
		const totalRequirements = Object.keys(complexityChecks).length;
		const strengthLabel = () => {
			const parts = [`Password strength: ${feedback}`];
			if (showMatchIndicator) {
				parts.push(passwordsMatch ? 'Passwords match' : 'Passwords do not match');
			}
			parts.push(`${metRequirements} of ${totalRequirements} requirements met`);
			return parts.join('. ');
		};
		if (showStrength) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="relative -mt-1 w-full space-y-2" role="region" aria-label="Password strength indicator"><div class="relative h-4 w-full overflow-hidden rounded-sm bg-gray-200 dark:bg-gray-700"><div role="progressbar"${attr('aria-valuenow', Math.round(percentage))}${attr('aria-valuemin', 0)}${attr('aria-valuemax', 100)}${attr('aria-label', strengthLabel())}${attr_class(`h-full rounded-sm transition-all ${stringify('duration-500 ease-out')} ${stringify(scoreColor)}`)}${attr_style(`width: ${stringify(percentage)}%;`)}>`
			);
			if (percentage > 25) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<span class="absolute inset-0 flex items-center justify-center text-[10px] font-bold sm:text-xs">${escape_html(feedback)}</span>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--> <span class="sr-only" aria-live="polite" aria-atomic="true">${escape_html(strengthLabel())}</span></div> `);
			if (percentage > 0 && percentage < 100) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<div class="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent opacity-60 transition-transform duration-500"${attr_style(`transform: translateX(${stringify(percentage - 20)}%);`)} aria-hidden="true"></div>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--></div> <div class="flex min-h-7 w-full items-center justify-between gap-2"><div class="min-w-0 flex-1">`);
			if (!showMatchIndicator) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`<div class="flex items-center gap-2"><span class="text-xs text-gray-500 dark:text-gray-400">Strength</span> `);
				if (showRequirements) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<button type="button" class="text-xs text-primary-500 hover:text-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 rounded"${attr('aria-expanded', showRequirementsList)} aria-controls="password-requirements">${escape_html('Show')} requirements</button>`
					);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--></div>`);
			} else {
				$$renderer2.push('<!--[!-->');
				$$renderer2.push(
					`<span${attr_class(`text-xs transition-colors ${stringify('duration-200')}`, void 0, {
						'text-red-500': !passwordsMatch,
						'text-green-500': passwordsMatch
					})} role="status" aria-live="polite">${escape_html(passwordsMatch ? '✓ Passwords match' : '✗ Passwords do not match')}</span>`
				);
			}
			$$renderer2.push(`<!--]--></div> <div class="flex shrink-0 gap-1" role="presentation" aria-hidden="true"><!--[-->`);
			const each_array = ensure_array_like([0, 1, 2]);
			for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
				let barIndex = each_array[$$index];
				$$renderer2.push(
					`<div${attr_class(`h-1.5 w-8 rounded-full transition-all ${stringify('duration-400 ease-out')} ${stringify(getBarColor(barIndex, score))}`)}${attr_style(`transform: scale(${stringify(barIndex < score ? 1 : 0.8)}); opacity: ${stringify(barIndex <= score ? 1 : 0.3)};`)}></div>`
				);
			}
			$$renderer2.push(`<!--]--></div></div> `);
			{
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--></div>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function FloatingPaths($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { background = 'white', position = 1, mirrorAnimation = false } = $$props;
		const pathConfigs = Array.from({ length: 36 }, (_, i) => ({
			id: i,
			d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
			width: 0.05 + i * 0.01,
			duration: 20 + (i % 15) * 0.7,
			// Duration in seconds (matching original)
			baseOpacity: 0.1 + i * 0.03
		}));
		let pathStates = pathConfigs.map(() => ({
			pathLength: 0.3,
			opacity: 0.3,
			pathOffset: mirrorAnimation ? 1 : 0
		}));
		$$renderer2.push(
			`<div class="pointer-events-none absolute inset-0"><svg${attr_class(`h-full w-full ${stringify(background === 'white' ? 'text-slate-950' : 'text-white')} ${stringify(mirrorAnimation ? '-scale-x-100' : '')}`)} viewBox="0 0 696 316" stroke-linecap="round" fill="transparent"><!--[-->`
		);
		const each_array = ensure_array_like(pathConfigs);
		for (let index = 0, $$length = each_array.length; index < $$length; index++) {
			let path = each_array[index];
			const state = pathStates[index];
			$$renderer2.push(
				`<path${attr('d', path.d)} stroke="currentColor"${attr('stroke-width', path.width)}${attr('stroke-opacity', state.opacity)} pathLength="1"${attr('stroke-dasharray', state.pathLength)}${attr('stroke-dashoffset', state.pathOffset)}></path>`
			);
		}
		$$renderer2.push(`<!--]--></svg></div>`);
	});
}
function OauthLogin($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { showOAuth = true } = $$props;
		if (publicEnv?.USE_GOOGLE_OAUTH === true && showOAuth) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<form id="oauth-login" action="?/signInOAuth" method="post" class="flex flex-col items-center justify-center"><button form="oauth-login" type="submit" aria-label="OAuth" class="preset-filled-surface-500 btn w-full sm:w-auto"><iconify-icon icon="flat-color-icons:google" color="white" width="20" class="mt-1"></iconify-icon> <p>OAuth</p></button></form>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function SignIn($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const {
			active = void 0,
			onClick = () => {},
			onPointerEnter: onPointerEnterProp = () => {},
			onBack = () => {},
			firstCollectionPath = ''
		} = $$props;
		let PWforgot = false;
		let PWreset = false;
		const showPassword = false;
		let formElement = null;
		const tabIndex = 1;
		const emailTabIndex = 1;
		const passwordTabIndex = 2;
		const confirmPasswordTabIndex = 3;
		const forgotPasswordTabIndex = 4;
		const pageData = page.data;
		let isSubmitting = false;
		let isAuthenticating = false;
		let requires2FA = false;
		let twoFACode = '';
		let useBackupCode = false;
		let isVerifying2FA = false;
		const loginForm = new Form({ email: '', password: '', isToken: false }, loginFormSchema);
		loginForm.enhance({
			onSubmit: ({ cancel }) => {
				if (loginForm.data.email) {
					loginForm.data.email = loginForm.data.email.toLowerCase();
				}
				if (Object.keys(loginForm.errors).length > 0) {
					cancel();
					setTimeout(() => formElement?.classList.remove('wiggle'), 300);
					return;
				}
				isSubmitting = true;
				isAuthenticating = true;
				globalLoadingStore.startLoading(loadingOperations.authentication);
			},
			onResult: async ({ result, update }) => {
				isSubmitting = false;
				if (result.type === 'redirect') {
					isAuthenticating = true;
					sessionStorage.setItem(
						'flashMessage',
						JSON.stringify({
							type: 'success',
							title: 'Welcome Back!',
							description: 'Successfully signed in.',
							duration: 4e3
						})
					);
					const redirectUrl = result.location || '/';
					window.location.href = redirectUrl;
					return;
				}
				if (result.type === 'failure' && result.data?.requires2FA) {
					requires2FA = true;
					result.data.userId || '';
					isAuthenticating = false;
					globalLoadingStore.stopLoading(loadingOperations.authentication);
					toaster.warning({
						title: 'Two-Factor Authentication Required',
						description: 'Please enter your authentication code to continue'
					});
					return;
				}
				isAuthenticating = false;
				globalLoadingStore.stopLoading(loadingOperations.authentication);
				if (result.type === 'failure' || result.type === 'error') {
					const errorMessage =
						result.type === 'failure' ? result.data?.message || 'Invalid email or password' : result.error?.message || 'An unexpected error occurred';
					toaster.error({ title: 'Sign In Failed', description: errorMessage });
					setTimeout(() => {}, 300);
				}
				await update();
			}
		});
		const forgotForm = new Form({ email: '' }, forgotFormSchema);
		forgotForm.enhance({
			onSubmit: ({ cancel }) => {
				if (forgotForm.data.email) {
					forgotForm.data.email = forgotForm.data.email.toLowerCase();
				}
				if (Object.keys(forgotForm.errors).length > 0) {
					cancel();
					setTimeout(() => formElement?.classList.remove('wiggle'), 300);
					return;
				}
				isSubmitting = true;
			},
			onResult: async ({ result, update }) => {
				isSubmitting = false;
				if (result.type === 'error') {
					toaster.info({ description: result.error?.message || 'An error occurred' });
					return;
				}
				if (result.type === 'success') {
					if (result.data && result.data.userExists === true) {
						PWreset = true;
						toaster.success({ description: signin_forgottontoast() });
						return;
					} else {
						if (result.data?.status === false) {
							PWreset = false;
							toaster.error({ description: 'No account found with this email address.' });
							setTimeout(() => formElement?.classList.remove('wiggle'), 300);
						} else {
							PWreset = true;
							toaster.success({
								title: 'Email Sent',
								description: 'Password reset instructions have been sent to your email'
							});
						}
					}
				} else if (result.type === 'failure') {
					const errorMessage = result.data?.message || 'Password reset failed';
					toaster.error({ title: 'Reset Failed', description: errorMessage });
					setTimeout(() => formElement?.classList.remove('wiggle'), 300);
					return;
				}
				await update();
			}
		});
		const resetForm = new Form({ password: '', confirm_password: '', token: '', email: '' }, resetFormSchema);
		resetForm.enhance({
			onSubmit: ({ cancel }) => {
				if (Object.keys(resetForm.errors).length > 0) {
					cancel();
					return;
				}
				isSubmitting = true;
			},
			onResult: async ({ result, update }) => {
				isSubmitting = false;
				PWreset = false;
				PWforgot = false;
				if (result.type === 'success' || result.type === 'redirect') {
					toaster.success({
						title: 'Password Reset Successful',
						description: 'You can now sign in with your new password'
					});
					if (result.type === 'redirect') {
						if (result.location) goto(result.location);
						return;
					}
				}
				await update();
				if (result.type === 'failure') {
					setTimeout(() => {}, 300);
				}
			}
		});
		function handleFormClick(event) {
			event.stopPropagation();
			onClick();
		}
		const isActive = active === 0;
		const isInactive = active !== void 0 && active !== 0;
		const isHover = active === void 0 || active === 1;
		const baseClasses = 'hover relative flex items-center';
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer3) {
			$$renderer3.push(
				`<section role="button"${attr('tabindex', tabIndex)}${attr_class(clsx(baseClasses), 'svelte-6xkclf', { active: isActive, inactive: isInactive, hover: isHover })}>`
			);
			if (active === 0) {
				$$renderer3.push('<!--[-->');
				$$renderer3.push(`<div class="relative flex min-h-screen w-full items-center justify-center overflow-hidden svelte-6xkclf">`);
				if (screen.isDesktop) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(`<div class="absolute inset-0 z-0 svelte-6xkclf">`);
					FloatingPaths($$renderer3, { position: 1, background: 'white' });
					$$renderer3.push(`<!----> `);
					FloatingPaths($$renderer3, { position: -1, background: 'white' });
					$$renderer3.push(`<!----></div>`);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(
					`<!--]--> <div class="absolute left-1/2 top-[20%] hidden -translate-x-1/2 -translate-y-1/2 transform xl:block svelte-6xkclf">`
				);
				SveltyCMS_LogoFull($$renderer3);
				$$renderer3.push(
					`<!----></div> <div${attr_class('z-0 mx-auto mb-[5%] mt-[15%] w-full overflow-y-auto rounded-md bg-white p-4 lg:w-4/5 svelte-6xkclf', void 0, { hide: active !== 0 })}><div class="mb-1 flex flex-row gap-2 svelte-6xkclf">`
				);
				SveltyCMS_Logo($$renderer3, { className: 'w-14', fill: 'red' });
				$$renderer3.push(
					`<!----> <h1 class="text-3xl font-bold text-black lg:text-4xl svelte-6xkclf"><div class="text-xs text-surface-300 svelte-6xkclf">`
				);
				SiteName($$renderer3, { highlight: 'CMS', textClass: 'text-black' });
				$$renderer3.push(`<!----></div> `);
				if (!PWforgot && !PWreset) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(`<div class="lg:-mt-1 svelte-6xkclf">${escape_html(form_signin())}</div>`);
				} else {
					$$renderer3.push('<!--[!-->');
					if (PWforgot && !PWreset) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(`<div class="text-2xl lg:-mt-1 lg:text-4xl svelte-6xkclf">${escape_html(signin_forgottenpassword())}</div>`);
					} else {
						$$renderer3.push('<!--[!-->');
						if (PWforgot && PWreset) {
							$$renderer3.push('<!--[-->');
							$$renderer3.push(`<div class="lg:-mt-1 svelte-6xkclf">${escape_html(form_resetpassword())}</div>`);
						} else {
							$$renderer3.push('<!--[!-->');
						}
						$$renderer3.push(`<!--]-->`);
					}
					$$renderer3.push(`<!--]-->`);
				}
				$$renderer3.push(
					`<!--]--></h1></div> <div class="-mt-2 flex items-center justify-end gap-2 text-right text-xs text-error-500 svelte-6xkclf">${escape_html(form_required())} <button aria-label="Back" class="btn-icon preset-outlined-secondary-500 rounded-full svelte-6xkclf"><iconify-icon icon="ri:arrow-right-line" width="20" class="text-black svelte-6xkclf"></iconify-icon></button></div> `
				);
				if (!PWforgot && !PWreset) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<form id="signin-form" method="POST" action="?/signIn"${attr_class('flex w-full flex-col gap-3 svelte-6xkclf', void 0, { hide: active !== 0 })}${attr('inert', active !== 0, true)}>`
					);
					FloatingInput($$renderer3, {
						id: 'emailsignIn',
						name: 'email',
						type: 'email',
						tabindex: emailTabIndex,
						autocomplete: 'username',
						autocapitalize: 'none',
						spellcheck: false,
						label: email(),
						required: true,
						icon: 'mdi:email',
						'data-testid': 'signin-email',
						get value() {
							return loginForm.data.email;
						},
						set value($$value) {
							loginForm.data.email = $$value;
							$$settled = false;
						}
					});
					$$renderer3.push(`<!----> `);
					if (loginForm.errors.email) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(`<span class="invalid text-xs text-error-500 svelte-6xkclf">${escape_html(loginForm.errors.email[0])}</span>`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--> `);
					FloatingInput($$renderer3, {
						id: 'passwordsignIn',
						name: 'password',
						type: 'password',
						autocomplete: 'current-password',
						tabindex: passwordTabIndex,
						required: true,
						showPassword,
						label: form_password(),
						icon: 'mdi:lock',
						iconColor: 'black',
						textColor: 'black',
						'data-testid': 'signin-password',
						get value() {
							return loginForm.data.password;
						},
						set value($$value) {
							loginForm.data.password = $$value;
							$$settled = false;
						}
					});
					$$renderer3.push(`<!----> `);
					if (loginForm.errors.password) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(`<span class="invalid text-xs text-error-500 svelte-6xkclf">${escape_html(loginForm.errors.password[0])}</span>`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(
						`<!--]--></form> <div class="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-between svelte-6xkclf"><div class="flex w-full justify-between gap-2 sm:w-auto svelte-6xkclf"><button type="submit" form="signin-form" class="preset-filled-surface-500 btn w-full text-white sm:w-auto svelte-6xkclf"${attr('aria-label', form_signin())} data-testid="signin-submit">${escape_html(form_signin())} `
					);
					if (isSubmitting || isAuthenticating) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(`<img src="/Spinner.svg" alt="" aria-hidden="true" decoding="async" class="ml-4 h-6 invert filter svelte-6xkclf"/>`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--></button> `);
					OauthLogin($$renderer3, { showOAuth: pageData.showOAuth });
					$$renderer3.push(
						`<!----></div> <div class="mt-4 flex w-full justify-between sm:mt-0 sm:w-auto svelte-6xkclf"><button type="button" class="btn preset-outlined-surface-500 w-full text-black sm:w-auto svelte-6xkclf"${attr('aria-label', signin_forgottenpassword())}${attr('tabindex', forgotPasswordTabIndex)} data-testid="signin-forgot-password">${escape_html(signin_forgottenpassword())}</button></div></div>`
					);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]--> `);
				if (requires2FA && !PWforgot && !PWreset) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<div class="flex w-full flex-col gap-4 svelte-6xkclf"><div class="text-center svelte-6xkclf"><div class="mb-3 svelte-6xkclf"><iconify-icon icon="mdi:shield-key" width="48" class="mx-auto text-primary-500 svelte-6xkclf"></iconify-icon></div> <h3 class="h3 mb-2 svelte-6xkclf">${escape_html(twofa_verify_title())}</h3> <p class="text-sm text-surface-600 dark:text-surface-300 svelte-6xkclf">${escape_html(twofa_verify_description())}</p></div> <div class="flex flex-col gap-3 svelte-6xkclf"><div class="relative svelte-6xkclf"><input type="text"${attr('value', twoFACode)}${attr('placeholder', twofa_code_placeholder())}${attr_class('input text-center font-mono tracking-wider svelte-6xkclf', void 0, { 'text-2xl': !useBackupCode, 'text-lg': useBackupCode })}${attr('maxlength', 6)} autocomplete="off"/> `
					);
					{
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(
						`<!--]--></div> <div class="text-center svelte-6xkclf"><button type="button" class="text-sm text-primary-500 underline hover:text-primary-600 svelte-6xkclf"${attr('aria-label', twofa_use_backup_code())}>${escape_html(twofa_use_backup_code())}</button></div> <div class="flex gap-3 svelte-6xkclf"><button type="button" class="btn preset-tonal -surface-500 flex-1 svelte-6xkclf"${attr('aria-label', button_back())}><iconify-icon icon="mdi:arrow-left" width="20" class="mr-2 svelte-6xkclf"></iconify-icon> ${escape_html(button_back())}</button> <button type="button"${attr('disabled', !twoFACode.trim() || isVerifying2FA || twoFACode.length !== 6 || useBackupCode, true)} class="btn preset-filled-primary-500 flex-1 svelte-6xkclf"${attr('aria-label', twofa_verify_button())}>`
					);
					{
						$$renderer3.push('<!--[!-->');
						$$renderer3.push(
							`<iconify-icon icon="mdi:check" width="20" class="mr-2 svelte-6xkclf"></iconify-icon> ${escape_html(twofa_verify_button())}`
						);
					}
					$$renderer3.push(
						`<!--]--></button></div> <div class="mt-2 text-center svelte-6xkclf"><div class="text-xs text-surface-500 svelte-6xkclf">`
					);
					{
						$$renderer3.push('<!--[-->');
						$$renderer3.push(`<p class="svelte-6xkclf">Enter the 6-digit code from your authenticator app</p>`);
					}
					$$renderer3.push(`<!--]--></div></div></div></div>`);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]--> `);
				if (PWforgot && !PWreset) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<form method="POST" action="?/forgotPW"${attr_class('flex w-full flex-col gap-3 svelte-6xkclf', void 0, { hide: active !== 0 })}${attr('inert', active !== 0, true)}>`
					);
					FloatingInput($$renderer3, {
						id: 'emailforgot',
						name: 'email',
						type: 'email',
						tabindex: emailTabIndex,
						autocomplete: 'email',
						autocapitalize: 'none',
						spellcheck: false,
						label: email(),
						required: true,
						icon: 'mdi:email',
						get value() {
							return forgotForm.data.email;
						},
						set value($$value) {
							forgotForm.data.email = $$value;
							$$settled = false;
						}
					});
					$$renderer3.push(`<!----> `);
					if (forgotForm.errors.email) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(`<span class="invalid text-xs text-error-500 svelte-6xkclf">${escape_html(forgotForm.errors.email[0])}</span>`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--> `);
					if (Object.keys(forgotForm.errors).length > 0 && !forgotForm.errors.email) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<span class="invalid text-xs text-error-500 svelte-6xkclf">${escape_html(Object.values(forgotForm.errors).flat().join(', '))}</span>`
						);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(
						`<!--]--> <div class="mt-4 flex items-center justify-between svelte-6xkclf"><button type="submit" class="preset-filled-surface-500 text-white btn svelte-6xkclf"${attr('aria-label', form_resetpassword())}>${escape_html(form_resetpassword())} `
					);
					if (isSubmitting) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(`<img src="/Spinner.svg" alt="" aria-hidden="true" decoding="async" class="ml-4 h-6 invert filter svelte-6xkclf"/>`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(
						`<!--]--></button> <button type="button" class="btn-icon preset-filled-surface-500 rounded-full svelte-6xkclf" aria-label="Back"><iconify-icon icon="mdi:arrow-left-circle" width="38" class="svelte-6xkclf"></iconify-icon></button></div></form>`
					);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]--> `);
				if (PWforgot && PWreset) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<form method="POST" action="?/resetPW"${attr_class('flex w-full flex-col gap-3 svelte-6xkclf', void 0, { hide: active !== 0 })}${attr('inert', active !== 0, true)}><input type="hidden" name="email"${attr('value', resetForm.data.email)} class="svelte-6xkclf"/> <input type="hidden" name="token"${attr('value', resetForm.data.token)} class="svelte-6xkclf"/> `
					);
					FloatingInput($$renderer3, {
						id: 'passwordreset',
						name: 'password',
						type: 'password',
						tabindex: passwordTabIndex,
						required: true,
						showPassword,
						autocomplete: 'new-password',
						label: form_password(),
						icon: 'mdi:lock',
						iconColor: 'black',
						textColor: 'black',
						get value() {
							return resetForm.data.password;
						},
						set value($$value) {
							resetForm.data.password = $$value;
							$$settled = false;
						}
					});
					$$renderer3.push(`<!----> `);
					if (resetForm.errors.password) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(`<span class="invalid text-xs text-error-500 svelte-6xkclf">${escape_html(resetForm.errors.password[0])}</span>`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--> `);
					FloatingInput($$renderer3, {
						id: 'confirm_passwordreset',
						name: 'confirm_password',
						type: 'password',
						tabindex: confirmPasswordTabIndex,
						showPassword,
						autocomplete: 'new-password',
						label: confirm_password?.() || form_confirmpassword?.(),
						icon: 'mdi:lock',
						iconColor: 'black',
						textColor: 'black',
						get value() {
							return resetForm.data.confirm_password;
						},
						set value($$value) {
							resetForm.data.confirm_password = $$value;
							$$settled = false;
						}
					});
					$$renderer3.push(`<!----> `);
					PasswordStrength($$renderer3, {
						password: resetForm.data.password,
						confirmPassword: resetForm.data.confirm_password
					});
					$$renderer3.push(`<!----> `);
					FloatingInput($$renderer3, {
						id: 'tokenresetPW',
						name: 'token',
						type: 'password',
						showPassword,
						label: registration_token?.() || signin_registrationtoken?.(),
						icon: 'mdi:lock',
						iconColor: 'black',
						textColor: 'black',
						required: true,
						get value() {
							return resetForm.data.token;
						},
						set value($$value) {
							resetForm.data.token = $$value;
							$$settled = false;
						}
					});
					$$renderer3.push(`<!----> `);
					if (resetForm.errors.token) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(`<span class="invalid text-xs text-error-500 svelte-6xkclf">${escape_html(resetForm.errors.token[0])}</span>`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--> `);
					if (Object.keys(resetForm.errors).length > 0 && !resetForm.errors.token) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<span class="invalid text-xs text-error-500 svelte-6xkclf">${escape_html(Object.values(resetForm.errors).flat().join(', '))}</span>`
						);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(
						`<!--]--> <input type="email" name="email"${attr('value', resetForm.data.email)} hidden="" class="svelte-6xkclf"/> <div class="mt-4 flex items-center justify-between svelte-6xkclf"><button type="submit"${attr('aria-label', signin_savenewpassword())} class="btn preset-filled-surface-500 ml-2 mt-6 text-white svelte-6xkclf">${escape_html(signin_savenewpassword())} `
					);
					if (isSubmitting) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(`<img src="/Spinner.svg" alt="" aria-hidden="true" decoding="async" class="ml-4 h-6 svelte-6xkclf"/>`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(
						`<!--]--></button> <button type="button"${attr('aria-label', button_back())} class="preset-filled-surface-500 btn-icon svelte-6xkclf"><iconify-icon icon="mdi:arrow-left-circle" width="38" class="svelte-6xkclf"></iconify-icon></button></div></form>`
					);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]--></div></div>`);
			} else {
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(`<!--]--> `);
			SigninIcon($$renderer3, {
				show: active === 1 || active === void 0,
				onClick: handleFormClick
			});
			$$renderer3.push(`<!----></section>`);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer2.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer2.subsume($$inner_renderer);
		bind_props($$props, { active });
	});
}
function SignupIcon($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { show = true, disabled = false, onClick = (_event) => {} } = $$props;
		$$renderer2.push(
			`<div${attr_class(
				'overflow icon dark:text-dark absolute left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] transition-all duration-300 svelte-1oa9vu3',
				void 0,
				{
					hide: !show,
					'pointer-events-none': !show || disabled,
					'opacity-50': disabled
				}
			)}><div role="button"${attr('tabindex', disabled ? -1 : 0)} class="flex cursor-pointer flex-col items-center"><div class="relative w-max rounded-full border-4 border-white p-3"><svg class="over aspect-square h-12" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 50 50" fill="#FFFFFF"><path d="M19.875 0.40625C15.203125 0.492188 12.21875 2.378906 10.9375 5.3125C9.714844 8.105469 9.988281 11.632813 10.875 15.28125C10.398438 15.839844 10.019531 16.589844 10.15625 17.71875C10.304688 18.949219 10.644531 19.824219 11.125 20.4375C11.390625 20.773438 11.738281 20.804688 12.0625 20.96875C12.238281 22.015625 12.53125 23.0625 12.96875 23.9375C13.21875 24.441406 13.503906 24.90625 13.78125 25.28125C13.90625 25.449219 14.085938 25.546875 14.21875 25.6875C14.226563 26.921875 14.230469 27.949219 14.125 29.25C13.800781 30.035156 13.042969 30.667969 11.8125 31.28125C10.542969 31.914063 8.890625 32.5 7.21875 33.21875C5.546875 33.9375 3.828125 34.8125 2.46875 36.1875C1.109375 37.5625 0.148438 39.449219 0 41.9375L-0.0625 43L25 43L24.34375 41L2.25 41C2.53125 39.585938 3.058594 38.449219 3.90625 37.59375C4.972656 36.515625 6.425781 35.707031 8 35.03125C9.574219 34.355469 11.230469 33.820313 12.6875 33.09375C14.144531 32.367188 15.492188 31.410156 16.0625 29.875L16.125 29.625C16.277344 27.949219 16.21875 26.761719 16.21875 25.3125L16.21875 24.71875L15.6875 24.4375C15.777344 24.484375 15.5625 24.347656 15.375 24.09375C15.1875 23.839844 14.957031 23.476563 14.75 23.0625C14.335938 22.234375 13.996094 21.167969 13.90625 20.3125L13.8125 19.5L12.96875 19.4375C12.960938 19.4375 12.867188 19.449219 12.6875 19.21875C12.507813 18.988281 12.273438 18.480469 12.15625 17.5C12.058594 16.667969 12.480469 16.378906 12.4375 16.40625L13.09375 16L12.90625 15.28125C11.964844 11.65625 11.800781 8.363281 12.78125 6.125C13.757813 3.894531 15.75 2.492188 19.90625 2.40625C19.917969 2.40625 19.925781 2.40625 19.9375 2.40625C21.949219 2.414063 23.253906 3.003906 23.625 3.65625L23.875 4.0625L24.34375 4.125C25.734375 4.320313 26.53125 4.878906 27.09375 5.65625C27.65625 6.433594 27.96875 7.519531 28.0625 8.71875C28.25 11.117188 27.558594 13.910156 27.125 15.21875L26.875 16L27.5625 16.40625C27.519531 16.378906 27.945313 16.667969 27.84375 17.5C27.726563 18.480469 27.492188 18.988281 27.3125 19.21875C27.132813 19.449219 27.039063 19.4375 27.03125 19.4375L26.1875 19.5L26.09375 20.3125C26 21.175781 25.652344 22.234375 25.25 23.0625C25.046875 23.476563 24.839844 23.839844 24.65625 24.09375C24.472656 24.347656 24.28125 24.488281 24.375 24.4375L23.84375 24.71875L23.84375 25.3125C23.84375 26.757813 23.785156 27.949219 23.9375 29.625L23.9375 29.75L24 29.875C24.320313 30.738281 24.882813 31.605469 25.8125 32.15625L26.84375 30.4375C26.421875 30.1875 26.144531 29.757813 25.9375 29.25C25.832031 27.949219 25.835938 26.921875 25.84375 25.6875C25.972656 25.546875 26.160156 25.449219 26.28125 25.28125C26.554688 24.902344 26.816406 24.4375 27.0625 23.9375C27.488281 23.0625 27.796875 22.011719 27.96875 20.96875C28.28125 20.804688 28.617188 20.765625 28.875 20.4375C29.355469 19.824219 29.695313 18.949219 29.84375 17.71875C29.976563 16.625 29.609375 15.902344 29.15625 15.34375C29.644531 13.757813 30.269531 11.195313 30.0625 8.5625C29.949219 7.125 29.582031 5.691406 28.71875 4.5C27.929688 3.40625 26.648438 2.609375 25.03125 2.28125C23.980469 0.917969 22.089844 0.40625 19.90625 0.40625 Z M 38 26C31.382813 26 26 31.382813 26 38C26 44.617188 31.382813 50 38 50C44.617188 50 50 44.617188 50 38C50 31.382813 44.617188 26 38 26 Z M 38 28C43.535156 28 48 32.464844 48 38C48 43.535156 43.535156 48 38 48C32.464844 48 28 43.535156 28 38C28 32.464844 32.464844 28 38 28 Z M 37 32L37 37L32 37L32 39L37 39L37 44L39 44L39 39L44 39L44 37L39 37L39 32Z" fill="#FFFFFF"></path></svg></div> <p class="text-center font-semibold uppercase text-white">${escape_html(form_signup())}</p></div></div>`
		);
		bind_props($$props, { show });
	});
}
function SignUp($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const {
			active = void 0,
			isInviteFlow = false,
			token = '',
			invitedEmail = '',
			inviteError = '',
			onClick = () => {},
			onPointerEnter = () => {},
			onBack = () => {},
			firstCollectionPath = ''
		} = $$props;
		const pageData = page.data;
		const firstUserExists = pageData.firstUserExists;
		const showOAuth = pageData.showOAuth;
		const hasExistingOAuthUsers = pageData.hasExistingOAuthUsers;
		const tabIndex = 1;
		let response = void 0;
		let showPassword = false;
		let isSubmitting = false;
		let isRedirecting = false;
		const usernameTabIndex = 1;
		const emailTabIndex = 2;
		const passwordTabIndex = 3;
		const confirmPasswordTabIndex = 4;
		const tokenTabIndex = 5;
		const signUpForm = new Form(
			{
				username: '',
				email: '',
				password: '',
				confirm_password: '',
				token: ''
			},
			signUpFormSchema
		);
		signUpForm.enhance({
			onSubmit: ({ cancel }) => {
				if (Object.keys(signUpForm.errors).length > 0) {
					cancel();
					return;
				}
				isSubmitting = true;
			},
			onResult: async ({ result, update }) => {
				isSubmitting = false;
				if (result.type === 'redirect') {
					isRedirecting = true;
					toaster.success({
						title: 'Account Created!',
						description: 'Welcome to SveltyCMS. Redirecting to your dashboard...'
					});
					setTimeout(() => {
						isRedirecting = false;
					}, 100);
					return;
				}
				isRedirecting = false;
				if (result.type === 'failure' || result.type === 'error') {
					const errorMessage =
						result.type === 'failure' ? result.data?.message || 'Failed to create account' : result.error?.message || 'An unexpected error occurred';
					toaster.error({ title: 'Sign Up Failed', description: errorMessage });
					setTimeout(() => {}, 300);
				}
				if (result.type === 'success') {
					response = result.data?.message;
					toaster.success({
						title: 'Account Created',
						description: result.data?.message || 'Your account has been successfully created'
					});
				}
				await update();
			}
		});
		signUpForm.data.token;
		new URLSearchParams('');
		function handleFormClick(event) {
			event.stopPropagation();
			onClick();
		}
		const isActive = active === 1;
		const isInactive = active !== void 0 && active !== 1;
		const isHover = active === void 0 || active === 0;
		const baseClasses = 'hover relative flex items-center overflow-y-auto';
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer3) {
			$$renderer3.push(
				`<section role="button"${attr('tabindex', tabIndex)}${attr_class(clsx(baseClasses), 'svelte-gtc6np', { active: isActive, inactive: isInactive, hover: isHover })}>`
			);
			if (active === 1) {
				$$renderer3.push('<!--[-->');
				$$renderer3.push(`<div class="relative flex min-h-screen w-full items-center justify-center overflow-hidden svelte-gtc6np">`);
				if (screen.isDesktop) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(`<div class="absolute inset-0 z-0 svelte-gtc6np">`);
					FloatingPaths($$renderer3, { position: 1, background: 'dark', mirrorAnimation: true });
					$$renderer3.push(`<!----> `);
					FloatingPaths($$renderer3, { position: -1, background: 'dark', mirrorAnimation: true });
					$$renderer3.push(`<!----></div>`);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(
					`<!--]--> <div class="absolute left-1/2 top-[20%] hidden -translate-x-1/2 -translate-y-1/2 transform xl:block svelte-gtc6np">`
				);
				SveltyCMS_LogoFull($$renderer3);
				$$renderer3.push(
					`<!----></div> <div${attr_class('relative z-10 mx-auto mb-[5%] mt-[15%] w-full rounded-md bg-[#242728] p-4 lg:w-4/5 svelte-gtc6np', void 0, { hide: active !== 1 })}><div class="mb-4 flex flex-row gap-2 svelte-gtc6np">`
				);
				SveltyCMS_Logo($$renderer3, { className: 'w-14', fill: 'red' });
				$$renderer3.push(
					`<!----> <h1 class="text-3xl font-bold text-white lg:text-4xl svelte-gtc6np"><div class="text-xs text-surface-200 svelte-gtc6np">`
				);
				SiteName($$renderer3, { highlight: 'CMS' });
				$$renderer3.push(`<!----></div> <div class="wrap-break-word lg:-mt-1 svelte-gtc6np">`);
				if (isInviteFlow) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`${escape_html(form_signup())} <span class="text-2xl text-primary-500 sm:text-3xl svelte-gtc6np">: Complete Invitation</span>`
					);
				} else {
					$$renderer3.push('<!--[!-->');
					$$renderer3.push(
						`${escape_html(form_signup())} <span class="text-2xl capitalize text-primary-500 sm:text-3xl svelte-gtc6np">: New User</span>`
					);
				}
				$$renderer3.push(
					`<!--]--></div></h1></div> <div class="-mt-2 flex items-center justify-end gap-2 text-right text-xs text-error-500 svelte-gtc6np">${escape_html(form_required())} <button aria-label="Back" class="btn-icon rounded-full preset-outlined-secondary-500 svelte-gtc6np"><iconify-icon icon="ri:arrow-left-line" width="20" class="text-white svelte-gtc6np"></iconify-icon></button></div> <form method="post" action="?/signUp"${attr_class('items flex flex-col gap-3 svelte-gtc6np', void 0, { hide: active !== 1 })}${attr('inert', active !== 1, true)}>`
				);
				FloatingInput($$renderer3, {
					id: 'usernamesignUp',
					name: 'username',
					type: 'text',
					tabindex: usernameTabIndex,
					required: true,
					label: username(),
					minlength: 2,
					maxlength: 24,
					icon: 'mdi:user-circle',
					iconColor: 'white',
					textColor: 'white',
					inputClass: 'text-white',
					autocomplete: 'username',
					get value() {
						return signUpForm.data.username;
					},
					set value($$value) {
						signUpForm.data.username = $$value;
						$$settled = false;
					}
				});
				$$renderer3.push(`<!----> `);
				if (signUpForm.errors.username) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(`<span class="text-xs text-error-500 svelte-gtc6np">${escape_html(signUpForm.errors.username[0])}</span>`);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]--> `);
				FloatingInput($$renderer3, {
					id: 'emailsignUp',
					name: 'email',
					type: 'email',
					tabindex: emailTabIndex,
					required: true,
					autocomplete: 'email',
					autocapitalize: 'none',
					spellcheck: false,
					label: email(),
					minlength: 5,
					maxlength: 50,
					icon: 'mdi:email',
					iconColor: 'white',
					textColor: 'white',
					inputClass: `text-white ${stringify(isInviteFlow ? 'opacity-70' : '')}`,
					disabled: isInviteFlow,
					get value() {
						return signUpForm.data.email;
					},
					set value($$value) {
						signUpForm.data.email = $$value;
						$$settled = false;
					}
				});
				$$renderer3.push(`<!----> `);
				if (signUpForm.errors.email) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(`<span class="text-xs text-error-500 svelte-gtc6np">${escape_html(signUpForm.errors.email[0])}</span>`);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]--> `);
				if (isInviteFlow) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(`<span class="text-xs text-primary-400 svelte-gtc6np">✓ Email pre-filled from invitation</span>`);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]--> `);
				if (isInviteFlow) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(`<input type="hidden" name="email"${attr('value', signUpForm.data.email)} class="svelte-gtc6np"/>`);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]--> `);
				FloatingInput($$renderer3, {
					id: 'passwordsignUp',
					name: 'password',
					type: 'password',
					tabindex: passwordTabIndex,
					required: true,
					label: form_password(),
					minlength: 8,
					maxlength: 50,
					icon: 'mdi:password',
					iconColor: 'white',
					textColor: 'white',
					passwordIconColor: 'white',
					inputClass: 'text-white',
					autocomplete: 'new-password',
					get value() {
						return signUpForm.data.password;
					},
					set value($$value) {
						signUpForm.data.password = $$value;
						$$settled = false;
					},
					get showPassword() {
						return showPassword;
					},
					set showPassword($$value) {
						showPassword = $$value;
						$$settled = false;
					}
				});
				$$renderer3.push(`<!----> `);
				if (signUpForm.errors.password) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(`<span class="text-xs text-error-500 svelte-gtc6np">${escape_html(signUpForm.errors.password[0])}</span>`);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]--> `);
				FloatingInput($$renderer3, {
					id: 'confirm_passwordsignUp',
					name: 'confirm_password',
					type: 'password',
					tabindex: confirmPasswordTabIndex,
					required: true,
					label: confirm_password?.() || form_confirmpassword?.(),
					minlength: 8,
					maxlength: 50,
					icon: 'mdi:password',
					iconColor: 'white',
					textColor: 'white',
					passwordIconColor: 'white',
					inputClass: 'text-white',
					autocomplete: 'new-password',
					get value() {
						return signUpForm.data.confirm_password;
					},
					set value($$value) {
						signUpForm.data.confirm_password = $$value;
						$$settled = false;
					},
					get showPassword() {
						return showPassword;
					},
					set showPassword($$value) {
						showPassword = $$value;
						$$settled = false;
					}
				});
				$$renderer3.push(`<!----> `);
				if (signUpForm.errors.confirm_password) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(`<span class="text-xs text-error-500 svelte-gtc6np">${escape_html(signUpForm.errors.confirm_password[0])}</span>`);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]--> `);
				PasswordStrength($$renderer3, {
					password: signUpForm.data.password,
					confirmPassword: signUpForm.data.confirm_password
				});
				$$renderer3.push(`<!----> `);
				if (!isInviteFlow) {
					$$renderer3.push('<!--[-->');
					FloatingInput($$renderer3, {
						id: 'tokensignUp',
						name: 'token',
						type: 'password',
						tabindex: tokenTabIndex,
						required: true,
						label: registration_token?.() || signup_registrationtoken?.(),
						minlength: 36,
						maxlength: 36,
						icon: 'mdi:key-chain',
						iconColor: 'white',
						textColor: 'white',
						passwordIconColor: 'white',
						inputClass: 'text-white',
						autocomplete: 'one-time-code',
						get value() {
							return signUpForm.data.token;
						},
						set value($$value) {
							signUpForm.data.token = $$value;
							$$settled = false;
						}
					});
					$$renderer3.push(`<!----> `);
					if (signUpForm.errors.token) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(`<span class="text-xs text-error-500 svelte-gtc6np">${escape_html(signUpForm.errors.token[0])}</span>`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--> `);
					if (signUpForm.data.token && inviteError) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<span class="text-xs text-warning-400 svelte-gtc6np">⚠️ Token was pre-filled from URL and will be validated against the server</span>`
						);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]-->`);
				} else {
					$$renderer3.push('<!--[!-->');
					if (isInviteFlow) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<input type="hidden" name="token"${attr('value', token)} class="svelte-gtc6np"/> <span class="text-xs text-primary-400 svelte-gtc6np">✓ Using invitation token</span>`
						);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]-->`);
				}
				$$renderer3.push(`<!--]--> `);
				if (response) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(`<span class="text-xs text-error-500 svelte-gtc6np">${escape_html(response)}</span>`);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]--> `);
				if (inviteError && !signUpForm.data.token) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(`<span class="text-xs text-error-500 svelte-gtc6np">${escape_html(inviteError)}</span>`);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]--> `);
				if (!showOAuth) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<button type="submit" class="btn bg-white text-black mt-4 uppercase svelte-gtc6np"${attr('aria-label', isInviteFlow ? 'Accept Invitation' : form_signup())}>${escape_html(isInviteFlow ? 'Accept Invitation & Create Account' : form_signup())} `
					);
					if (isSubmitting || isRedirecting) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(`<img src="/Spinner.svg" alt="" aria-hidden="true" decoding="async" class="ml-4 h-6 svelte-gtc6np"/>`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--></button>`);
				} else {
					$$renderer3.push('<!--[!-->');
					$$renderer3.push(
						`<div class="btn-group mt-4 border border-secondary-500 text-white [&amp;>*+*]:border-secondary-500 svelte-gtc6np"><button type="submit" class="btn w-3/4 rounded-none bg-surface-200 text-black hover:text-white svelte-gtc6np"${attr('aria-label', isInviteFlow ? 'Accept Invitation' : form_signup())}><span class="w-full text-black hover:text-white svelte-gtc6np">${escape_html(isInviteFlow ? 'Accept Invitation' : form_signup())}</span> `
					);
					if (isSubmitting || isRedirecting) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(`<img src="/Spinner.svg" alt="" aria-hidden="true" decoding="async" class="ml-4 h-6 svelte-gtc6np"/>`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(
						`<!--]--></button> <button type="button" aria-label="OAuth" class="btn flex w-1/4 items-center justify-center svelte-gtc6np"><iconify-icon icon="flat-color-icons:google" color="white" width="20" class="mr-0.5 sm:mr-2 svelte-gtc6np"></iconify-icon> <span class="svelte-gtc6np">OAuth</span></button></div> `
					);
					if (!isInviteFlow && firstUserExists && !hasExistingOAuthUsers) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<p class="mt-2 text-xs text-surface-400 svelte-gtc6np">💡 Note: Both email/password and Google OAuth registration require an invitation token from an administrator.</p>`
						);
					} else {
						$$renderer3.push('<!--[!-->');
						if (!isInviteFlow && hasExistingOAuthUsers) {
							$$renderer3.push('<!--[-->');
							$$renderer3.push(
								`<p class="mt-2 text-xs text-surface-400 svelte-gtc6np">💡 Note: New user registration requires an invitation token from an administrator.</p>`
							);
						} else {
							$$renderer3.push('<!--[!-->');
						}
						$$renderer3.push(`<!--]-->`);
					}
					$$renderer3.push(`<!--]-->`);
				}
				$$renderer3.push(`<!--]--></form></div></div>`);
			} else {
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(`<!--]--> `);
			SignupIcon($$renderer3, {
				show: active === 0 || active === void 0,
				onClick: handleFormClick
			});
			$$renderer3.push(`<!----></section>`);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer2.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer2.subsume($$inner_renderer);
		bind_props($$props, { active });
	});
}
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { data } = $$props;
		const firstUserExists = data.firstUserExists;
		let active = void 0;
		let background = '#242728';
		let timeRemaining = { minutes: 0, seconds: 0 };
		let searchQuery = '';
		let isTransitioning = false;
		let debounceTimeout = void 0;
		const availableLanguages = [...locales].sort((a, b) => getLanguageName(a, 'en').localeCompare(getLanguageName(b, 'en')));
		const filteredLanguages = availableLanguages.filter(
			(lang) =>
				getLanguageName(lang, systemLanguage.value).toLowerCase().includes(searchQuery.toLowerCase()) ||
				getLanguageName(lang, 'en').toLowerCase().includes(searchQuery.toLowerCase())
		);
		const currentLanguage = systemLanguage.value && locales.includes(systemLanguage.value) ? systemLanguage.value : 'en';
		function handleLanguageSelection(lang) {
			clearTimeout(debounceTimeout);
			debounceTimeout = setTimeout(() => {
				systemLanguage.set(lang);
				searchQuery = '';
			}, 100);
		}
		function resetToInitialState() {
			if (isTransitioning) return;
			isTransitioning = true;
			active = void 0;
			background = data.demoMode ? '#242728' : getPublicSetting('SEASONS') ? '#242728' : firstUserExists ? 'white' : '#242728';
			setTimeout(() => {
				isTransitioning = false;
			}, 300);
		}
		function handleSignInClick(event) {
			if (event) {
				event.stopPropagation();
			}
			if (isTransitioning) return;
			isTransitioning = true;
			if (!firstUserExists) {
				active = 1;
				background = '#242728';
			} else {
				active = 0;
				background = 'white';
			}
			setTimeout(() => {
				isTransitioning = false;
			}, 400);
		}
		function handleSignUpClick(event) {
			if (event) {
				event.stopPropagation();
			}
			if (isTransitioning) return;
			isTransitioning = true;
			active = 1;
			background = '#242728';
			setTimeout(() => {
				isTransitioning = false;
			}, 400);
		}
		function handleSignInPointerEnter() {
			if (active === void 0 && !data.demoMode && !getPublicSetting('SEASONS')) {
				background = 'white';
			}
		}
		function handleSignUpPointerEnter() {
			if (active === void 0 && !data.demoMode && !getPublicSetting('SEASONS')) {
				background = '#242728';
			}
		}
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer3) {
			$$renderer3.push(
				`<div${attr_class(`flex min-h-lvh w-full overflow-y-auto bg-${background} transition-colors duration-300`, 'svelte-1x05zx6')}><div${attr_class(
					'pointer-events-none fixed inset-0 z-10 transition-all duration-300',
					void 0,
					{
						'opacity-0': active === void 0,
						'opacity-100': active !== void 0
					}
				)}>`
			);
			Seasons($$renderer3);
			$$renderer3.push(`<!----></div> `);
			if (data.showDatabaseError) {
				$$renderer3.push('<!--[-->');
				$$renderer3.push(
					`<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div class="max-w-2xl rounded-lg bg-white p-8 shadow-xl"><div class="mb-4 flex items-center gap-3"><svg class="h-8 w-8 text-error-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> <h2 class="text-2xl font-bold text-error-500">${escape_html(db_error_title())}</h2></div> <p class="mb-4 text-lg">${escape_html(db_error_description())}</p> <div class="mb-4 rounded-lg bg-surface-200 p-4"><p class="font-semibold">${escape_html(db_error_reason_label())}</p> <p class="text-sm">${escape_html(data.errorReason)}</p></div> <div class="mb-6"><h3 class="mb-2 font-semibold">${escape_html(db_error_solutions_title())}</h3> <ul class="list-inside list-disc space-y-1 text-sm"><li>${escape_html(db_error_solution_1())}</li> <li>${escape_html(db_error_solution_2())}</li> <li>${escape_html(db_error_solution_3())}</li> <li>${escape_html(db_error_solution_4())}</li></ul></div> `
				);
				if (data.canReset) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<div class="flex gap-4"><button type="button" class="preset-filled-warning-500 btn">${escape_html(db_error_reset_setup())}</button> <button type="button" class="preset-filled-secondary-500 btn">${escape_html(db_error_refresh_page())}</button></div>`
					);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]--></div></div>`);
			} else {
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(`<!--]--> `);
			SignIn($$renderer3, {
				onClick: handleSignInClick,
				onPointerEnter: handleSignInPointerEnter,
				onBack: resetToInitialState,
				firstCollectionPath: data.firstCollectionPath || '',
				get active() {
					return active;
				},
				set active($$value) {
					active = $$value;
					$$settled = false;
				}
			});
			$$renderer3.push(`<!----> `);
			SignUp($$renderer3, {
				isInviteFlow: data.isInviteFlow || false,
				token: data.token || '',
				invitedEmail: data.invitedEmail || '',
				inviteError: data.inviteError || '',
				onClick: handleSignUpClick,
				onPointerEnter: handleSignUpPointerEnter,
				onBack: resetToInitialState,
				firstCollectionPath: data.firstCollectionPath || '',
				get active() {
					return active;
				},
				set active($$value) {
					active = $$value;
					$$settled = false;
				}
			});
			$$renderer3.push(`<!----> `);
			if (active == void 0) {
				$$renderer3.push('<!--[-->');
				if (data.demoMode) {
					$$renderer3.push('<!--[-->');
					$$renderer3.push(
						`<div${attr_class('absolute bottom-2 left-1/2 flex min-w-[350px] -translate-x-1/2 -translate-y-1/2 transform flex-col items-center justify-center rounded-xl bg-error-500 p-3 text-center text-white transition-opacity duration-300 sm:bottom-12', void 0, { 'opacity-50': isTransitioning })} aria-live="polite" aria-atomic="true" role="status" aria-label="Demo mode active. Timer showing time remaining until next reset."><p class="text-2xl font-bold">${escape_html(login_demo_title())}</p> <p>${escape_html(login_demo_message())}</p> <p class="text-xl font-bold">${escape_html(login_demo_nextreset())} <span${attr('aria-label', `Time remaining: ${stringify(timeRemaining.minutes)} minutes and ${stringify(timeRemaining.seconds)} seconds`)}>${escape_html(timeRemaining.minutes)}:${escape_html(`0${timeRemaining.seconds}`)}</span></p></div>`
					);
				} else {
					$$renderer3.push('<!--[!-->');
				}
				$$renderer3.push(`<!--]--> <div class="absolute left-1/2 top-1/4 -translate-x-1/2 -translate-y-1/2 transform items-center justify-center">`);
				SveltyCMS_LogoFull($$renderer3);
				$$renderer3.push(
					`<!----></div> <div${attr_class('language-selector absolute bottom-1/4 left-1/2 -translate-x-1/2 transform transition-opacity duration-300', void 0, { 'opacity-50': isTransitioning })}>`
				);
				Menu($$renderer3, {
					positioning: { placement: 'top', gutter: 10 },
					children: ($$renderer4) => {
						$$renderer4.push(`<!---->`);
						Menu.Trigger($$renderer4, {
							class:
								'flex w-30 items-center justify-between gap-2 rounded-full border-2 bg-[#242728] px-4 py-2 text-white transition-colors duration-300 hover:bg-[#363a3b] focus:ring-2',
							'aria-label': 'Select language',
							children: ($$renderer5) => {
								$$renderer5.push(
									`<span>${escape_html(getLanguageName(currentLanguage))}</span> <iconify-icon icon="mdi:chevron-up" width="20"></iconify-icon>`
								);
							},
							$$slots: { default: true }
						});
						$$renderer4.push(`<!----> `);
						Portal($$renderer4, {
							children: ($$renderer5) => {
								$$renderer5.push(`<!---->`);
								Menu.Positioner($$renderer5, {
									children: ($$renderer6) => {
										$$renderer6.push(`<!---->`);
										Menu.Content($$renderer6, {
											class: 'card p-2 shadow-xl preset-filled-surface-100-900 z-9999 w-64 border border-surface-200 dark:border-surface-500',
											children: ($$renderer7) => {
												$$renderer7.push(
													`<div class="px-3 py-2 text-xs font-bold text-tertiary-500 dark:text-primary-500 uppercase tracking-wider text-center border-b border-surface-200 dark:border-surface-50 mb-1">${escape_html(applayout_systemlanguage())}</div> `
												);
												if (Array.isArray(getPublicSetting('LOCALES')) && getPublicSetting('LOCALES').length > 5) {
													$$renderer7.push('<!--[-->');
													$$renderer7.push(
														`<div class="px-2 pb-2 mb-1 border-b border-surface-200 dark:border-surface-50"><input type="text"${attr('value', searchQuery)} placeholder="Search language..." class="w-full rounded-md bg-surface-200 dark:bg-surface-800 px-3 py-2 text-sm placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 text-surface-900 dark:text-white border-none" aria-label="Search languages"/></div> <div class="max-h-64 divide-y divide-surface-200 dark:divide-surface-700 overflow-y-auto svelte-1x05zx6"><!--[-->`
													);
													const each_array = ensure_array_like(filteredLanguages);
													for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
														let lang = each_array[$$index];
														$$renderer7.push(`<!---->`);
														Menu.Item($$renderer7, {
															value: lang,
															onclick: () => handleLanguageSelection(lang),
															class: 'flex w-full items-center justify-between px-3 py-2 text-left rounded-sm cursor-pointer',
															children: ($$renderer8) => {
																$$renderer8.push(
																	`<span class="text-sm font-medium text-surface-900 dark:text-surface-200">${escape_html(getLanguageName(lang))}</span> <span class="text-xs font-normal text-tertiary-500 dark:text-primary-500 ml-2">${escape_html(lang.toUpperCase())}</span>`
																);
															},
															$$slots: { default: true }
														});
														$$renderer7.push(`<!---->`);
													}
													$$renderer7.push(`<!--]--></div>`);
												} else {
													$$renderer7.push('<!--[!-->');
													$$renderer7.push(`<!--[-->`);
													const each_array_1 = ensure_array_like(availableLanguages.filter((l) => l !== currentLanguage));
													for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
														let lang = each_array_1[$$index_1];
														$$renderer7.push(`<!---->`);
														Menu.Item($$renderer7, {
															value: lang,
															onclick: () => handleLanguageSelection(lang),
															class: 'flex w-full items-center justify-between px-3 py-2 text-left rounded-sm cursor-pointer',
															children: ($$renderer8) => {
																$$renderer8.push(
																	`<span class="text-sm font-medium">${escape_html(getLanguageName(lang))}</span> <span class="text-xs font-normal text-tertiary-500 dark:text-primary-500 ml-2">${escape_html(lang.toUpperCase())}</span>`
																);
															},
															$$slots: { default: true }
														});
														$$renderer7.push(`<!---->`);
													}
													$$renderer7.push(`<!--]-->`);
												}
												$$renderer7.push(`<!--]-->`);
											},
											$$slots: { default: true }
										});
										$$renderer6.push(`<!---->`);
									},
									$$slots: { default: true }
								});
								$$renderer5.push(`<!---->`);
							},
							$$slots: { default: true }
						});
						$$renderer4.push(`<!---->`);
					},
					$$slots: { default: true }
				});
				$$renderer3.push(`<!----></div> <div class="absolute bottom-5 left-1/2 -translate-x-1/2">`);
				VersionCheck($$renderer3, { transparent: true });
				$$renderer3.push(`<!----></div>`);
			} else {
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(`<!--]--></div>`);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer2.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer2.subsume($$inner_renderer);
	});
}
export { _page as default };
//# sourceMappingURL=_page.svelte.js.map
