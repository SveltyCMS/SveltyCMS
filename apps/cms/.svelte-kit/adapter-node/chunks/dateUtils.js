import { logger } from './logger.js';
function isISODateString(value) {
	if (typeof value !== 'string') return false;
	const date = new Date(value);
	return !isNaN(date.getTime()) && date.toISOString() === value;
}
function dateToISODateString(date) {
	const isoString = date.toISOString();
	if (!isISODateString(isoString)) {
		throw new Error('Invalid date conversion');
	}
	return isoString;
}
function toISOString(value) {
	if (value && typeof value === 'object' && 'toISOString' in value) {
		return value.toISOString();
	}
	if (typeof value === 'string' && isISODateString(value)) {
		return value;
	}
	if (value) {
		try {
			return new Date(value).toISOString();
		} catch {
			logger.warn('Failed to convert value to ISODateString, using current date', { value });
		}
	}
	return /* @__PURE__ */ new Date().toISOString();
}
function nowISODateString() {
	return dateToISODateString(/* @__PURE__ */ new Date());
}
function isoDateStringToDate(isoDate) {
	return new Date(isoDate);
}
function formatDateString(dateInput, pattern = 'yyyy-MM-dd', fallback = '') {
	try {
		let date;
		if (typeof dateInput === 'number') {
			date = new Date(dateInput > 1e12 ? dateInput : dateInput * 1e3);
		} else if (typeof dateInput === 'string') {
			date = new Date(dateInput);
		} else {
			date = dateInput;
		}
		if (isNaN(date.getTime())) {
			return fallback;
		}
		const yyyy = date.getFullYear().toString();
		const MM = (date.getMonth() + 1).toString().padStart(2, '0');
		const dd = date.getDate().toString().padStart(2, '0');
		const HH = date.getHours().toString().padStart(2, '0');
		const mm = date.getMinutes().toString().padStart(2, '0');
		const ss = date.getSeconds().toString().padStart(2, '0');
		return pattern.replace('yyyy', yyyy).replace('MM', MM).replace('dd', dd).replace('HH', HH).replace('mm', mm).replace('ss', ss);
	} catch (error) {
		logger.error('Error formatting date string:', error);
		return fallback;
	}
}
function formatDisplayDate(
	dateInput,
	locale = 'en',
	options = {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	}
) {
	try {
		let date;
		if (typeof dateInput === 'number') {
			date = new Date(dateInput > 1e12 ? dateInput : dateInput * 1e3);
		} else if (typeof dateInput === 'string') {
			date = new Date(dateInput);
		} else {
			date = dateInput;
		}
		if (isNaN(date.getTime())) {
			return 'Invalid Date';
		}
		return new Intl.DateTimeFormat(locale, options).format(date);
	} catch (error) {
		logger.error('Error formatting date:', error);
		return 'Invalid Date';
	}
}
export { formatDateString as a, dateToISODateString as d, formatDisplayDate as f, isoDateStringToDate as i, nowISODateString as n, toISOString as t };
//# sourceMappingURL=dateUtils.js.map
