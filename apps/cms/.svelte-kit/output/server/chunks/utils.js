import { publicEnv } from './globalSettings.svelte.js';
import './store.svelte.js';
import './logger.js';
const obj2formData = (obj) => {
	const formData = new FormData();
	const transformValue = (value) => {
		if (value instanceof Blob) {
			return value;
		} else if (typeof value === 'object' && value !== null) {
			return JSON.stringify(value);
		} else if (typeof value === 'boolean' || typeof value === 'number') {
			return value.toString();
		} else if (value === null || value === void 0) {
			return '';
		}
		return String(value);
	};
	for (const key in obj) {
		const value = obj[key];
		if (value !== void 0) {
			formData.append(key, transformValue(value));
		}
	}
	return formData;
};
function sanitize(str) {
	return str.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
}
const env_sizes = publicEnv.IMAGE_SIZES || {};
({ ...env_sizes });
function getFieldName(field, rawName = false) {
	if (!field) return '';
	if (field.db_fieldName) {
		return rawName ? field.db_fieldName : field.db_fieldName;
	}
	const specialMappings = {
		'First Name': 'first_name',
		'Last Name': 'last_name'
	};
	let name = field.label;
	if (!name && 'widget' in field && field.widget?.Name) {
		name = field.widget.Name;
	}
	if (!name && 'type' in field) {
		name = field.type;
	}
	if (!name) {
		name = 'unknown_field';
	}
	if (rawName) return name;
	if (specialMappings[name]) {
		return specialMappings[name];
	}
	return name
		.toLowerCase()
		.replace(/\s+/g, '_')
		.replace(/[^a-z0-9_]/g, '');
}
function removeExtension(fileName) {
	return fileName.replace(/\.[^/.]+$/, '');
}
function formatBytes(bytes) {
	if (bytes === 0 || isNaN(bytes)) {
		return '0 bytes';
	}
	if (bytes < 0) {
		throw Error('Input size cannot be negative');
	}
	const units = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
	let power = 0;
	while (bytes >= 1024 && power < units.length - 1) {
		bytes /= 1024;
		power++;
	}
	return `${bytes.toFixed(2)} ${units[power]}`;
}
const meta_data = {
	meta_data: {},
	add(key, data) {
		this.meta_data[key] = data;
	},
	get() {
		return this.meta_data;
	},
	clear() {
		this.meta_data = {};
	},
	is_empty() {
		return Object.keys(this.meta_data).length === 0;
	}
};
function arrayBuffer2hex(buffer) {
	return Array.from(new Uint8Array(buffer))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}
async function sha256(buffer) {
	const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
	return arrayBuffer2hex(hashBuffer);
}
function debounce(delay = 300, immediate = false) {
	let timer;
	let hasExecuted = false;
	return (fn) => {
		const shouldExecuteImmediately = immediate && !hasExecuted;
		if (shouldExecuteImmediately) {
			fn();
			hasExecuted = true;
			return;
		}
		clearTimeout(timer);
		timer = setTimeout(() => {
			fn();
		}, delay);
	};
}
debounce.create = function (func, wait = 300) {
	let timeout;
	return function executedFunction(...args) {
		const later = () => {
			clearTimeout(timeout);
			func(...args);
		};
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
	};
};
export { sha256 as a, debounce as d, formatBytes as f, getFieldName as g, meta_data as m, obj2formData as o, removeExtension as r, sanitize as s };
//# sourceMappingURL=utils.js.map
