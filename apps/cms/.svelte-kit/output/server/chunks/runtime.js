const baseLocale = 'en';
const locales =
	/** @type {const} */
	['en', 'de'];
const cookieName = 'PARAGLIDE_LOCALE';
const strategy = ['cookie', 'globalVariable', 'baseLocale'];
globalThis.__paraglide = {};
let _locale;
let localeInitiallySet = false;
let getLocale = () => {
	let locale;
	for (const strat of strategy) {
		if (strat === 'cookie') {
			locale = extractLocaleFromCookie();
		} else if (strat === 'baseLocale') {
			locale = baseLocale;
		} else if (strat === 'globalVariable' && _locale !== void 0) {
			locale = _locale;
		} else if (isCustomStrategy(strat) && customClientStrategies.has(strat)) {
			const handler = customClientStrategies.get(strat);
			if (handler) {
				const result = handler.getLocale();
				if (result instanceof Promise) {
					continue;
				}
				locale = result;
			}
		}
		if (locale !== void 0) {
			const asserted = assertIsLocale(locale);
			if (!localeInitiallySet) {
				_locale = asserted;
				localeInitiallySet = true;
				setLocale(asserted, { reload: false });
			}
			return asserted;
		}
	}
	throw new Error('No locale found. Read the docs https://inlang.com/m/gerre34r/library-inlang-paraglideJs/errors#no-locale-found');
};
let setLocale = (newLocale, options) => {
	({
		...options
	});
	let currentLocale;
	try {
		currentLocale = getLocale();
	} catch {}
	const customSetLocalePromises = [];
	for (const strat of strategy) {
		if (strat === 'globalVariable') {
			_locale = newLocale;
		} else if (strat === 'cookie') {
			{
				continue;
			}
		} else if (strat === 'baseLocale') {
			continue;
		} else if (isCustomStrategy(strat) && customClientStrategies.has(strat)) {
			const handler = customClientStrategies.get(strat);
			if (handler) {
				let result = handler.setLocale(newLocale);
				if (result instanceof Promise) {
					result = result.catch((error) => {
						throw new Error(`Custom strategy "${strat}" setLocale failed.`, {
							cause: error
						});
					});
					customSetLocalePromises.push(result);
				}
			}
		}
	}
	if (customSetLocalePromises.length) {
		return Promise.all(customSetLocalePromises).then(() => {});
	}
	return;
};
function isLocale(locale) {
	if (typeof locale !== 'string') return false;
	return !locale ? false : locales.some((item) => item.toLowerCase() === locale.toLowerCase());
}
function assertIsLocale(input) {
	if (typeof input !== 'string') {
		throw new Error(`Invalid locale: ${input}. Expected a string.`);
	}
	const lowerInput = input.toLowerCase();
	const matchedLocale = locales.find((item) => item.toLowerCase() === lowerInput);
	if (!matchedLocale) {
		throw new Error(`Invalid locale: ${input}. Expected one of: ${locales.join(', ')}`);
	}
	return matchedLocale;
}
function extractLocaleFromCookie() {
	if (typeof document === 'undefined' || !document.cookie) {
		return;
	}
	const match = document.cookie.match(new RegExp(`(^| )${cookieName}=([^;]+)`));
	const locale = match?.[2];
	if (isLocale(locale)) {
		return locale;
	}
	return void 0;
}
const customClientStrategies = /* @__PURE__ */ new Map();
function isCustomStrategy(strategy2) {
	return typeof strategy2 === 'string' && /^custom-[A-Za-z0-9_-]+$/.test(strategy2);
}
export { getLocale as g, locales as l };
//# sourceMappingURL=runtime.js.map
