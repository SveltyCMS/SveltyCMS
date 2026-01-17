const stringToIcon = (value, validate, allowSimpleName, provider = '') => {
	const colonSeparated = value.split(':');
	if (value.slice(0, 1) === '@') {
		if (colonSeparated.length < 2 || colonSeparated.length > 3) return null;
		provider = colonSeparated.shift().slice(1);
	}
	if (colonSeparated.length > 3 || !colonSeparated.length) return null;
	if (colonSeparated.length > 1) {
		const name$1 = colonSeparated.pop();
		const prefix = colonSeparated.pop();
		const result = {
			provider: colonSeparated.length > 0 ? colonSeparated[0] : provider,
			prefix,
			name: name$1
		};
		return !validateIconName(result) ? null : result;
	}
	const name = colonSeparated[0];
	const dashSeparated = name.split('-');
	if (dashSeparated.length > 1) {
		const result = {
			provider,
			prefix: dashSeparated.shift(),
			name: dashSeparated.join('-')
		};
		return !validateIconName(result) ? null : result;
	}
	if (allowSimpleName && provider === '') {
		const result = {
			provider,
			prefix: '',
			name
		};
		return !validateIconName(result, allowSimpleName) ? null : result;
	}
	return null;
};
const validateIconName = (icon, allowSimpleName) => {
	if (!icon) return false;
	return !!(((allowSimpleName && icon.prefix === '') || !!icon.prefix) && !!icon.name);
};
function getIconsTree(data, names) {
	const icons = data.icons;
	const aliases = data.aliases || /* @__PURE__ */ Object.create(null);
	const resolved = /* @__PURE__ */ Object.create(null);
	function resolve(name) {
		if (icons[name]) return (resolved[name] = []);
		if (!(name in resolved)) {
			resolved[name] = null;
			const parent = aliases[name] && aliases[name].parent;
			const value = parent && resolve(parent);
			if (value) resolved[name] = [parent].concat(value);
		}
		return resolved[name];
	}
	Object.keys(icons).concat(Object.keys(aliases)).forEach(resolve);
	return resolved;
}
const defaultIconDimensions = Object.freeze({
	left: 0,
	top: 0,
	width: 16,
	height: 16
});
const defaultIconTransformations = Object.freeze({
	rotate: 0,
	vFlip: false,
	hFlip: false
});
const defaultIconProps = Object.freeze({
	...defaultIconDimensions,
	...defaultIconTransformations
});
const defaultExtendedIconProps = Object.freeze({
	...defaultIconProps,
	body: '',
	hidden: false
});
function mergeIconTransformations(obj1, obj2) {
	const result = {};
	if (!obj1.hFlip !== !obj2.hFlip) result.hFlip = true;
	if (!obj1.vFlip !== !obj2.vFlip) result.vFlip = true;
	const rotate = ((obj1.rotate || 0) + (obj2.rotate || 0)) % 4;
	if (rotate) result.rotate = rotate;
	return result;
}
function mergeIconData(parent, child) {
	const result = mergeIconTransformations(parent, child);
	for (const key in defaultExtendedIconProps)
		if (key in defaultIconTransformations) {
			if (key in parent && !(key in result)) result[key] = defaultIconTransformations[key];
		} else if (key in child) result[key] = child[key];
		else if (key in parent) result[key] = parent[key];
	return result;
}
function internalGetIconData(data, name, tree) {
	const icons = data.icons;
	const aliases = data.aliases || /* @__PURE__ */ Object.create(null);
	let currentProps = {};
	function parse(name$1) {
		currentProps = mergeIconData(icons[name$1] || aliases[name$1], currentProps);
	}
	parse(name);
	tree.forEach(parse);
	return mergeIconData(data, currentProps);
}
function parseIconSet(data, callback) {
	const names = [];
	if (typeof data !== 'object' || typeof data.icons !== 'object') return names;
	if (data.not_found instanceof Array)
		data.not_found.forEach((name) => {
			callback(name, null);
			names.push(name);
		});
	const tree = getIconsTree(data);
	for (const name in tree) {
		const item = tree[name];
		if (item) {
			callback(name, internalGetIconData(data, name, item));
			names.push(name);
		}
	}
	return names;
}
const optionalPropertyDefaults = {
	provider: '',
	aliases: {},
	not_found: {},
	...defaultIconDimensions
};
function checkOptionalProps(item, defaults) {
	for (const prop in defaults) if (prop in item && typeof item[prop] !== typeof defaults[prop]) return false;
	return true;
}
function quicklyValidateIconSet(obj) {
	if (typeof obj !== 'object' || obj === null) return null;
	const data = obj;
	if (typeof data.prefix !== 'string' || !obj.icons || typeof obj.icons !== 'object') return null;
	if (!checkOptionalProps(obj, optionalPropertyDefaults)) return null;
	const icons = data.icons;
	for (const name in icons) {
		const icon = icons[name];
		if (!name || typeof icon.body !== 'string' || !checkOptionalProps(icon, defaultExtendedIconProps)) return null;
	}
	const aliases = data.aliases || /* @__PURE__ */ Object.create(null);
	for (const name in aliases) {
		const icon = aliases[name];
		const parent = icon.parent;
		if (!name || typeof parent !== 'string' || (!icons[parent] && !aliases[parent]) || !checkOptionalProps(icon, defaultExtendedIconProps))
			return null;
	}
	return data;
}
const dataStorage = /* @__PURE__ */ Object.create(null);
function newStorage(provider, prefix) {
	return {
		provider,
		prefix,
		icons: /* @__PURE__ */ Object.create(null),
		missing: /* @__PURE__ */ new Set()
	};
}
function getStorage(provider, prefix) {
	const providerStorage = dataStorage[provider] || (dataStorage[provider] = /* @__PURE__ */ Object.create(null));
	return providerStorage[prefix] || (providerStorage[prefix] = newStorage(provider, prefix));
}
function addIconSet(storage2, data) {
	if (!quicklyValidateIconSet(data)) return [];
	return parseIconSet(data, (name, icon) => {
		if (icon) storage2.icons[name] = icon;
		else storage2.missing.add(name);
	});
}
function addIconToStorage(storage2, name, icon) {
	try {
		if (typeof icon.body === 'string') {
			storage2.icons[name] = { ...icon };
			return true;
		}
	} catch (err) {}
	return false;
}
let simpleNames = false;
function allowSimpleNames(allow) {
	simpleNames = allow;
	return simpleNames;
}
function addIcon(name, data) {
	const icon = stringToIcon(name, true, simpleNames);
	if (!icon) return false;
	const storage2 = getStorage(icon.provider, icon.prefix);
	if (data) return addIconToStorage(storage2, icon.name, data);
	else {
		storage2.missing.add(icon.name);
		return true;
	}
}
function addCollection(data, provider) {
	if (typeof data !== 'object') return false;
	if (typeof provider !== 'string') provider = data.provider || '';
	if (simpleNames && !provider && !data.prefix) {
		let added = false;
		if (quicklyValidateIconSet(data)) {
			data.prefix = '';
			parseIconSet(data, (name, icon) => {
				if (addIcon(name, icon)) added = true;
			});
		}
		return added;
	}
	const prefix = data.prefix;
	if (
		!validateIconName({
			prefix,
			name: 'a'
		})
	)
		return false;
	return !!addIconSet(getStorage(provider, prefix), data);
}
const defaultIconSizeCustomisations = Object.freeze({
	width: null,
	height: null
});
const defaultIconCustomisations = Object.freeze({
	...defaultIconSizeCustomisations,
	...defaultIconTransformations
});
const storage = /* @__PURE__ */ Object.create(null);
function setAPIModule(provider, item) {
	storage[provider] = item;
}
function createAPIConfig(source) {
	let resources;
	if (typeof source.resources === 'string') resources = [source.resources];
	else {
		resources = source.resources;
		if (!(resources instanceof Array) || !resources.length) return null;
	}
	return {
		resources,
		path: source.path || '/',
		maxURL: source.maxURL || 500,
		rotate: source.rotate || 750,
		timeout: source.timeout || 5e3,
		random: source.random === true,
		index: source.index || 0,
		dataAfterTimeout: source.dataAfterTimeout !== false
	};
}
const configStorage = /* @__PURE__ */ Object.create(null);
const fallBackAPISources = ['https://api.simplesvg.com', 'https://api.unisvg.com'];
const fallBackAPI = [];
while (fallBackAPISources.length > 0)
	if (fallBackAPISources.length === 1) fallBackAPI.push(fallBackAPISources.shift());
	else if (Math.random() > 0.5) fallBackAPI.push(fallBackAPISources.shift());
	else fallBackAPI.push(fallBackAPISources.pop());
configStorage[''] = createAPIConfig({ resources: ['https://api.iconify.design'].concat(fallBackAPI) });
function addAPIProvider(provider, customConfig) {
	const config = createAPIConfig(customConfig);
	if (config === null) return false;
	configStorage[provider] = config;
	return true;
}
function getAPIConfig(provider) {
	return configStorage[provider];
}
const detectFetch = () => {
	let callback;
	try {
		callback = fetch;
		if (typeof callback === 'function') return callback;
	} catch (err) {}
};
let fetchModule = detectFetch();
function calculateMaxLength(provider, prefix) {
	const config = getAPIConfig(provider);
	if (!config) return 0;
	let result;
	if (!config.maxURL) result = 0;
	else {
		let maxHostLength = 0;
		config.resources.forEach((item) => {
			const host = item;
			maxHostLength = Math.max(maxHostLength, host.length);
		});
		const url = prefix + '.json?icons=';
		result = config.maxURL - maxHostLength - config.path.length - url.length;
	}
	return result;
}
function shouldAbort(status) {
	return status === 404;
}
const prepare = (provider, prefix, icons) => {
	const results = [];
	const maxLength = calculateMaxLength(provider, prefix);
	const type = 'icons';
	let item = {
		type,
		provider,
		prefix,
		icons: []
	};
	let length = 0;
	icons.forEach((name, index) => {
		length += name.length + 1;
		if (length >= maxLength && index > 0) {
			results.push(item);
			item = {
				type,
				provider,
				prefix,
				icons: []
			};
			length = name.length;
		}
		item.icons.push(name);
	});
	results.push(item);
	return results;
};
function getPath(provider) {
	if (typeof provider === 'string') {
		const config = getAPIConfig(provider);
		if (config) return config.path;
	}
	return '/';
}
const send = (host, params, callback) => {
	if (!fetchModule) {
		callback('abort', 424);
		return;
	}
	let path = getPath(params.provider);
	switch (params.type) {
		case 'icons': {
			const prefix = params.prefix;
			const iconsList = params.icons.join(',');
			const urlParams = new URLSearchParams({ icons: iconsList });
			path += prefix + '.json?' + urlParams.toString();
			break;
		}
		case 'custom': {
			const uri = params.uri;
			path += uri.slice(0, 1) === '/' ? uri.slice(1) : uri;
			break;
		}
		default:
			callback('abort', 400);
			return;
	}
	let defaultError = 503;
	fetchModule(host + path)
		.then((response) => {
			const status = response.status;
			if (status !== 200) {
				setTimeout(() => {
					callback(shouldAbort(status) ? 'abort' : 'next', status);
				});
				return;
			}
			defaultError = 501;
			return response.json();
		})
		.then((data) => {
			if (typeof data !== 'object' || data === null) {
				setTimeout(() => {
					if (data === 404) callback('abort', data);
					else callback('next', defaultError);
				});
				return;
			}
			setTimeout(() => {
				callback('success', data);
			});
		})
		.catch(() => {
			callback('next', defaultError);
		});
};
const fetchAPIModule = {
	prepare,
	send
};
({
	...defaultIconCustomisations
});
const monotoneProps = {
	'background-color': 'currentColor'
};
const coloredProps = {
	'background-color': 'transparent'
};
const propsToAdd = {
	image: 'var(--svg)',
	repeat: 'no-repeat',
	size: '100% 100%'
};
const propsToAddTo = {
	'-webkit-mask': monotoneProps,
	mask: monotoneProps,
	background: coloredProps
};
for (const prefix in propsToAddTo) {
	const list = propsToAddTo[prefix];
	for (const prop in propsToAdd) {
		list[prefix + '-' + prop] = propsToAdd[prop];
	}
}
allowSimpleNames(true);
setAPIModule('', fetchAPIModule);
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
	const _window = window;
	if (_window.IconifyPreload !== void 0) {
		const preload = _window.IconifyPreload;
		const err = 'Invalid IconifyPreload syntax.';
		if (typeof preload === 'object' && preload !== null) {
			(preload instanceof Array ? preload : [preload]).forEach((item) => {
				try {
					if (
						// Check if item is an object and not null/array
						typeof item !== 'object' ||
						item === null ||
						item instanceof Array || // Check for 'icons' and 'prefix'
						typeof item.icons !== 'object' ||
						typeof item.prefix !== 'string' || // Add icon set
						!addCollection(item)
					) {
						console.error(err);
					}
				} catch (e) {
					console.error(err);
				}
			});
		}
	}
	if (_window.IconifyProviders !== void 0) {
		const providers = _window.IconifyProviders;
		if (typeof providers === 'object' && providers !== null) {
			for (let key in providers) {
				const err = 'IconifyProviders[' + key + '] is invalid.';
				try {
					const value = providers[key];
					if (typeof value !== 'object' || !value || value.resources === void 0) {
						continue;
					}
					if (!addAPIProvider(key, value)) {
						console.error(err);
					}
				} catch (e) {
					console.error(err);
				}
			}
		}
	}
}
//# sourceMappingURL=functions.js.map
