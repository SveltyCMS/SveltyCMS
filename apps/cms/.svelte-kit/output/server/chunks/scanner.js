import { a as attr, d as escape_html, g as attr_class, i as clsx, h as bind_props, e as ensure_array_like, c as stringify } from './index5.js';
import {
	c2 as iconpicker_placeholder,
	c3 as widget_checkbox_description,
	c4 as widget_date_description,
	c5 as widget_daterange_description1,
	c6 as widget_text_description,
	c7 as widget_media_description,
	c8 as widget_megamenu_description1,
	c9 as widget_radio_description,
	ca as widget_relation_description,
	cb as widget_richtext_description1,
	cc as widget_address_description,
	cd as widget_colorpicker_description1,
	ce as widget_currency_description,
	cf as widget_email_description,
	cg as widget_number_description,
	ch as widget_phonenumber_description1,
	ci as widget_rating_description,
	cj as widget_remotevideo_description1,
	ck as widget_seo_description
} from './_index.js';
import { o as onDestroy } from './index-server.js';
import './functions.js';
import './logger.js';
import './store.svelte.js';
import { a as PermissionAction } from './types.js';
/* empty css                                      */
import {
	boolean,
	pipe,
	string,
	minLength,
	isoDate,
	object,
	check,
	transform,
	maxLength,
	optional,
	record,
	array,
	literal,
	union,
	custom,
	number,
	regex,
	minValue,
	maxValue,
	email,
	url
} from 'valibot';
import { c as collections } from './collectionStore.svelte.js';
function IconifyPicker($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { iconselected = void 0, searchQuery = '', showFavorites = true } = $$props;
		let iconLibraries = {};
		let favorites = [];
		let showDropdown = false;
		let previewSize = 24;
		Object.keys(iconLibraries).length > 0;
		searchQuery.trim().length > 0;
		const isFavorite = favorites.includes(iconselected);
		(() => {
			return Object.entries(iconLibraries).sort(([, a], [, b]) => a.name.localeCompare(b.name));
		})();
		onDestroy(() => {});
		$$renderer2.push(`<!---->\`\`\` <div class="icon-picker-container flex w-full flex-col">`);
		if (iconselected) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="mb-2 flex items-center justify-between gap-2"><div class="flex flex-1 items-center gap-3 rounded-lg bg-surface-100 p-2 dark:bg-surface-800"><iconify-icon${attr('icon', iconselected)}${attr('width', previewSize)} class="text-tertiary-500 transition-transform duration-200 hover:scale-110 dark:text-primary-500" aria-hidden="true"></iconify-icon> <div class="flex-1 overflow-hidden"><p class="text-xs text-surface-600 dark:text-surface-50">Selected Icon</p> <p class="truncate text-sm font-medium text-tertiary-500 dark:text-primary-500">${escape_html(iconselected)}</p></div></div> <div class="flex gap-1"><button type="button" class="btn-icon preset-outlined-surface-500 transition-all duration-200 hover:scale-110"${attr('aria-label', isFavorite ? 'Remove from favorites' : 'Add to favorites')}${attr('title', isFavorite ? 'Remove from favorites' : 'Add to favorites')}><iconify-icon${attr('icon', isFavorite ? 'mdi:heart' : 'mdi:heart-outline')} width="22"${attr_class(clsx(isFavorite ? 'text-error-500' : ''))}></iconify-icon></button> <button type="button" class="btn-icon preset-outlined-surface-500 transition-all duration-200 hover:scale-110" aria-label="Copy icon name" title="Copy icon name"><iconify-icon icon="mdi:content-copy" width="22"></iconify-icon></button> <button type="button" class="btn-icon preset-outlined-error-500 transition-all duration-200 hover:scale-110" aria-label="Remove selected icon" title="Remove icon"><iconify-icon icon="mdi:close" width="22"></iconify-icon></button></div></div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--> <div class="relative"><input type="text" role="combobox"${attr('value', searchQuery)}${attr('placeholder', iconselected ? `Replace: ${iconselected}` : iconpicker_placeholder())} class="input w-full pr-10 transition-all duration-200 focus:scale-[1.01] focus:shadow-lg" aria-label="Search icons" aria-controls="icon-dropdown" aria-haspopup="listbox"${attr('aria-expanded', showDropdown)}${attr('aria-describedby', void 0)}/> `
		);
		if (searchQuery) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200" aria-label="Clear search"><iconify-icon icon="mdi:close" width="20"></iconify-icon></button>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div> `);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div>`);
		bind_props($$props, { iconselected, searchQuery });
	});
}
function PermissionsSetting($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { permissions = {}, roles = [], onUpdate = () => {} } = $$props;
		let searchQuery = '';
		let showBulkActions = false;
		let historyIndex = -1;
		let permissionsHistory = [];
		const actionIcons = {
			[PermissionAction.CREATE]: 'bi:plus-circle-fill',
			[PermissionAction.READ]: 'bi:eye-fill',
			[PermissionAction.WRITE]: 'bi:pencil-square',
			[PermissionAction.UPDATE]: 'bi:pencil-fill',
			[PermissionAction.DELETE]: 'bi:trash-fill',
			[PermissionAction.MANAGE]: 'bi:gear-fill',
			[PermissionAction.ACCESS]: 'bi:key-fill',
			[PermissionAction.EXECUTE]: 'bi:play-fill',
			[PermissionAction.SHARE]: 'bi:share-fill'
		};
		const presets = {
			'read-only': {
				name: 'Read Only',
				description: 'Can only view content',
				permissions: {
					read: true,
					access: true,
					create: false,
					write: false,
					update: false,
					delete: false,
					manage: false,
					execute: false,
					share: false
				}
			},
			editor: {
				name: 'Editor',
				description: 'Can create and edit content',
				permissions: {
					read: true,
					access: true,
					create: true,
					write: true,
					update: true,
					share: true,
					delete: false,
					manage: false,
					execute: false
				}
			},
			admin: {
				name: 'Administrator',
				description: 'Full access to everything',
				permissions: Object.fromEntries(Object.values(PermissionAction).map((action) => [action, true]))
			}
		};
		function initializePermissions(currentPermissions, availableRoles) {
			const initialized = { ...currentPermissions };
			availableRoles.forEach((role) => {
				if (!initialized[role._id]) {
					initialized[role._id] = Object.fromEntries(Object.values(PermissionAction).map((action) => [action, true]));
				}
			});
			return initialized;
		}
		let permissionsState = initializePermissions(permissions, roles);
		const canRedo = historyIndex < permissionsHistory.length - 1;
		const filteredRoles = roles.filter(
			(role) => role.name.toLowerCase().includes(searchQuery.toLowerCase()) || role.description?.toLowerCase().includes(searchQuery.toLowerCase())
		);
		function countEnabledPermissions(roleId) {
			return Object.values(permissionsState[roleId] || {}).filter(Boolean).length;
		}
		const totalActions = Object.values(PermissionAction).length;
		{
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(
				`<div class="flex flex-col gap-4" role="region" aria-label="Permission settings"><div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div class="flex-1"><input${attr('value', searchQuery)} placeholder="Search roles..." class="input w-full" type="search" aria-label="Search roles"/></div> <div class="flex flex-wrap gap-2"><button${attr('disabled', true, true)} class="preset-outlined-surface-500btn btn-sm" title="Undo" aria-label="Undo last change"><iconify-icon icon="mdi:undo" width="18"></iconify-icon></button> <button${attr('disabled', !canRedo, true)} class="preset-outlined-surface-500btn btn-sm" title="Redo" aria-label="Redo last change"><iconify-icon icon="mdi:redo" width="18"></iconify-icon></button> <button class="preset-outlined-primary-500 btn-sm"${attr('aria-expanded', showBulkActions)}><iconify-icon icon="mdi:cog-box" width="18"></iconify-icon> Bulk Actions</button> <button class="preset-outlined-primary-500 btn-sm" title="Export permissions" aria-label="Export permissions as JSON"><iconify-icon icon="mdi:download" width="18"></iconify-icon></button> <label class="preset-outlined-warning-500 btn-sm cursor-pointer"><iconify-icon icon="mdi:upload" width="18"></iconify-icon> <input type="file" accept=".json" class="hidden" aria-label="Import permissions from JSON"/></label></div></div> `
			);
			{
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(
				`<!--]--> <div class="overflow-x-auto rounded-lg border border-surface-200 dark:text-surface-50"><table class="table w-full" role="grid"><thead><tr><th scope="col" class="px-4 py-3 text-left"><div class="flex items-center gap-2">Role <span class="text-xs font-normal opacity-70">(${escape_html(filteredRoles.length)})</span></div></th><!--[-->`
			);
			const each_array_1 = ensure_array_like(Object.values(PermissionAction));
			for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
				let action = each_array_1[$$index_1];
				$$renderer2.push(
					`<th scope="col" class="px-4 py-3 text-center"><div class="flex flex-col items-center gap-1"><iconify-icon${attr('icon', actionIcons[action])} width="20" aria-hidden="true"></iconify-icon> <span class="text-xs">${escape_html(action)}</span></div></th>`
				);
			}
			$$renderer2.push(`<!--]--><th scope="col" class="px-4 py-3 text-center">Actions</th></tr></thead><tbody><!--[-->`);
			const each_array_2 = ensure_array_like(filteredRoles);
			for (let $$index_4 = 0, $$length = each_array_2.length; $$index_4 < $$length; $$index_4++) {
				let role = each_array_2[$$index_4];
				$$renderer2.push(
					`<tr class="border-t border-surface-200 dark:text-surface-50"><th scope="row" class="px-4 py-3"><div class="flex flex-col gap-1"><div class="flex items-center gap-2"><span class="font-semibold">${escape_html(role.name)}</span> `
				);
				if (role.isAdmin) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(`<span class="badge preset-filled-primary-500 text-xs">Admin</span>`);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--></div> `);
				if (role.description) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(`<span class="text-xs text-surface-600 dark:text-surface-50">${escape_html(role.description)}</span>`);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(
					`<!--]--> <span class="text-xs font-medium text-primary-500">${escape_html(countEnabledPermissions(role._id))}/${escape_html(totalActions)} enabled</span></div></th><!--[-->`
				);
				const each_array_3 = ensure_array_like(Object.values(PermissionAction));
				for (let $$index_2 = 0, $$length2 = each_array_3.length; $$index_2 < $$length2; $$index_2++) {
					let action = each_array_3[$$index_2];
					$$renderer2.push(
						`<td class="px-4 py-3 text-center"><button${attr('disabled', role.isAdmin, true)}${attr('aria-label', `${permissionsState[role._id]?.[action] ? 'Disable' : 'Enable'} ${action} for ${role.name}`)}${attr_class(`btn-icon transition-all duration-200 ${stringify(permissionsState[role._id]?.[action] ? 'preset-filled-success-500 hover:scale-110' : 'preset-filled-error-500 opacity-50 hover:opacity-100 hover:scale-110')} ${stringify(role.isAdmin ? 'cursor-not-allowed opacity-30' : '')}`)}><iconify-icon${attr('icon', permissionsState[role._id]?.[action] ? 'mdi:check' : 'mdi:check')} width="18"${attr_class(clsx(permissionsState[role._id]?.[action] ? 'text-white' : 'text-white'))}></iconify-icon></button></td>`
					);
				}
				$$renderer2.push(
					`<!--]--><td class="px-4 py-3 text-center"><div class="flex justify-center gap-1"><button${attr('disabled', role.isAdmin, true)} class="preset-outlined-primary-500 btn-sm" title="Enable all"${attr('aria-label', `Enable all permissions for ${role.name}`)}>✓ All</button> <button${attr('disabled', role.isAdmin, true)} class="preset-outlined-error-500 btn-sm" title="Disable all"${attr('aria-label', `Disable all permissions for ${role.name}`)}>✗ All</button> <select${attr('disabled', role.isAdmin, true)} class="input w-auto px-2 py-1 text-xs"${attr('aria-label', `Apply preset to ${role.name}`)}>`
				);
				$$renderer2.option({ value: '' }, ($$renderer3) => {
					$$renderer3.push(`Preset...`);
				});
				$$renderer2.push(`<!--[-->`);
				const each_array_4 = ensure_array_like(Object.entries(presets));
				for (let $$index_3 = 0, $$length2 = each_array_4.length; $$index_3 < $$length2; $$index_3++) {
					let [key, preset] = each_array_4[$$index_3];
					$$renderer2.option({ value: key }, ($$renderer3) => {
						$$renderer3.push(`${escape_html(preset.name)}`);
					});
				}
				$$renderer2.push(`<!--]--></select></div></td></tr>`);
			}
			$$renderer2.push(`<!--]--></tbody></table></div> `);
			if (filteredRoles.length === 0) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<div class="flex flex-col items-center gap-3 rounded-lg bg-surface-50 py-12 text-center dark:bg-surface-800"><iconify-icon icon="mdi:magnify-close" width="48" class="text-surface-400"></iconify-icon> <p class="text-surface-600 dark:text-surface-50">No roles match your search for "<span class="font-medium">${escape_html(searchQuery)}</span>"</p></div>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--></div>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function Input($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { type = 'text', label, labelClass, inputClass, placeholder, value = '' } = $$props;
		$$renderer2.push(`<div class="m-1 flex max-w-full items-center justify-between gap-2">`);
		if (label) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<label for="input"${attr_class(`w-32 flex-none ${stringify(labelClass)}`)}>${escape_html(label)}</label>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--> <input id="input"${attr_class(`input grow text-black dark:text-primary-500 ${stringify(inputClass)}`)}${attr('value', value)}${attr('placeholder', placeholder)}/></div>`
		);
		bind_props($$props, { value });
	});
}
function Toggles($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let {
			value = false,
			label = '',
			labelColor = 'text-primary-500',
			iconOn = '',
			iconOff = '',
			size = 'md',
			disabled = false,
			title = '',
			onChange = void 0
		} = $$props;
		const id = `toggle-${Math.random().toString(36).substring(2, 9)}`;
		const trackClasses = {
			sm: 'h-6 w-10 min-w-[40px]',
			// Ensure minimum touch target size
			md: 'h-8 w-14 min-w-[48px]',
			lg: 'h-10 w-20 min-w-[56px]'
		}[size];
		const dotClasses = {
			sm: 'h-4 w-4 peer-checked:translate-x-5',
			md: 'h-6 w-6 peer-checked:translate-x-7',
			lg: 'h-8 w-8 peer-checked:translate-x-11'
		}[size];
		const iconSize = { sm: '16', md: '24', lg: '32' }[size];
		$$renderer2.push(
			`<label${attr('for', id)}${attr_class('flex cursor-pointer select-none items-center gap-2', void 0, { 'opacity-50': disabled, 'cursor-not-allowed': disabled })}${attr('title', title)}>`
		);
		if (label) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<span${attr_class(`capitalize ${stringify(value ? 'text-primary-500' : labelColor)}`)}>${escape_html(label)}</span>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--> <div class="relative"><input${attr('name', label || 'toggle')} type="checkbox"${attr('id', id)}${attr('checked', value, true)}${attr('disabled', disabled, true)} class="peer sr-only svelte-wbhl62"/> <div${attr_class(`${stringify(trackClasses)} rounded-full bg-error-500 transition-colors peer-checked:bg-primary-500`)}><div${attr_class(`${stringify(dotClasses)} absolute left-1 top-1 flex items-center justify-center rounded-full bg-white transition-transform`, void 0, { 'bg-surface-400': disabled })}>`
		);
		if (iconOn && iconOff) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<iconify-icon${attr('icon', value ? iconOn : iconOff)}${attr('width', iconSize)}${attr_class(clsx(value ? 'text-primary-500' : 'text-error-500'), void 0, { 'text-surface-600': disabled })}></iconify-icon>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(
				`<span${attr_class(`text-[10px] font-bold ${stringify(value ? 'text-primary-500' : 'text-error-500')}`, void 0, { 'text-surface-600': disabled })}>${escape_html(value ? 'ON' : 'OFF')}</span>`
			);
		}
		$$renderer2.push(`<!--]--></div></div></div></label>`);
		bind_props($$props, { value });
	});
}
function createWidget(config) {
	const widgetDefinition = {
		widgetId: config.Name,
		Name: config.Name,
		Icon: config.Icon,
		Description: config.Description,
		inputComponentPath: config.inputComponentPath || '',
		displayComponentPath: config.displayComponentPath || '',
		// validationSchema may be a function or a static schema. Keep as-is so other systems can call it.
		validationSchema: config.validationSchema,
		defaults: config.defaults,
		GuiFields: config.GuiSchema || {},
		aggregations: config.aggregations,
		getTranslatablePaths: config.getTranslatablePaths
		// ... other definition properties like GraphqlSchema
	};
	const widgetFactoryFunction = (fieldConfig) => {
		const fieldInstance = {
			widget: widgetDefinition,
			label: fieldConfig.label,
			// Will be overridden by fieldConfig later if present
			db_fieldName: '',
			// Will be set below
			required: false,
			// Will be overridden by fieldConfig or config.defaults later
			translated: false,
			// Will be overridden by fieldConfig or config.defaults later
			width: void 0,
			// Will be overridden by fieldConfig or config.defaults later
			helper: void 0,
			// Will be overridden by fieldConfig or config.defaults later
			permissions: void 0
			// Will be overridden by fieldConfig or config.defaults later
		};
		if (config.defaults) {
			for (const key in config.defaults) {
				if (Object.prototype.hasOwnProperty.call(config.defaults, key)) {
					const value = config.defaults[key];
					fieldInstance[key] = value;
				}
			}
		}
		for (const key in fieldConfig) {
			if (Object.prototype.hasOwnProperty.call(fieldConfig, key)) {
				const value = fieldConfig[key];
				if (value !== void 0) {
					fieldInstance[key] = value;
				}
			}
		}
		fieldInstance.required = fieldInstance.required ?? false;
		fieldInstance.translated = fieldInstance.translated ?? false;
		if (!fieldInstance.db_fieldName && fieldInstance.label) {
			fieldInstance.db_fieldName = fieldInstance.label
				.toLowerCase()
				.replace(/\s+/g, '_')
				.replace(/[^a-z0-9_]/g, '');
		} else if (!fieldInstance.db_fieldName) {
			fieldInstance.db_fieldName = 'unnamed_field';
		}
		return fieldInstance;
	};
	widgetFactoryFunction.Name = config.Name;
	widgetFactoryFunction.Icon = config.Icon;
	widgetFactoryFunction.Description = config.Description;
	widgetFactoryFunction.GuiSchema = config.GuiSchema;
	widgetFactoryFunction.GraphqlSchema = config.GraphqlSchema;
	widgetFactoryFunction.aggregations = config.aggregations;
	widgetFactoryFunction.__inputComponentPath = config.inputComponentPath || '';
	widgetFactoryFunction.__displayComponentPath = config.displayComponentPath || '';
	widgetFactoryFunction.toString = () => '';
	return widgetFactoryFunction;
}
const CheckboxValidationSchema = boolean('Must be a boolean.');
const CheckboxWidget = createWidget({
	Name: 'Checkbox',
	Icon: 'tabler:checkbox',
	Description: widget_checkbox_description(),
	// Define paths to the dedicated Svelte components.
	inputComponentPath: '/src/widgets/core/Checkbox/Input.svelte',
	displayComponentPath: '/src/widgets/core/Checkbox/Display.svelte',
	// Assign the validation schema.
	validationSchema: CheckboxValidationSchema,
	// Set widget-specific defaults.
	defaults: {
		color: 'primary',
		size: 'md',
		translated: false
		// A simple boolean is typically not translated.
	},
	// Pass the GuiSchema directly into the widget's definition.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		icon: { widget: IconifyPicker, required: false },
		helper: { widget: Input, required: false },
		width: { widget: Input, required: false },
		permissions: { widget: PermissionsSetting, required: false }
	},
	// Correct database aggregation logic for booleans.
	aggregations: {
		filters: async ({ field, filter }) => [{ $match: { [field.db_fieldName]: filter === 'true' } }],
		sorts: async ({ field, sortDirection }) => ({
			[field.db_fieldName]: sortDirection
		})
	},
	// GraphQL schema should return a simple Boolean.
	GraphqlSchema: () => ({
		typeID: 'Boolean',
		// Use primitive Boolean type
		graphql: ''
		// No custom type definition needed for primitives
	})
});
const __vite_glob_0_0 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: CheckboxWidget
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
const DateValidationSchema = pipe(
	string('A value is required.'),
	// This message shows if the value is not a string
	minLength(1, 'This date is required.'),
	// This message shows for empty strings
	isoDate('The date must be a valid ISO 8601 string.')
);
const DateWidget = createWidget({
	Name: 'Date',
	Icon: 'mdi:calendar',
	Description: widget_date_description(),
	// Define paths to the dedicated Svelte components.
	inputComponentPath: '/src/widgets/core/Date/Input.svelte',
	displayComponentPath: '/src/widgets/core/Date/Display.svelte',
	// Assign the validation schema.
	validationSchema: DateValidationSchema,
	// Set widget-specific defaults. A date is typically not translated.
	defaults: {
		translated: false
	},
	// Pass the GuiSchema directly into the widget's definition.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		icon: { widget: IconifyPicker, required: false },
		helper: { widget: Input, required: false },
		width: { widget: Input, required: false },
		permissions: { widget: PermissionsSetting, required: false },
		minDate: { widget: Input, required: false },
		maxDate: { widget: Input, required: false },
		displayFormat: {
			widget: Input,
			required: false,
			placeholder: 'medium (short, medium, long, full)'
		}
	},
	// Define correct database aggregation logic for dates.
	aggregations: {
		/**
		 * Filters entries based on a date or date range.
		 * Expects filter string format: "YYYY-MM-DD" or "YYYY-MM-DD_YYYY-MM-DD"
		 */
		filters: async ({ field, filter }) => {
			const fieldName = field.db_fieldName;
			const [startDateStr, endDateStr] = filter.split('_');
			const startDate = new Date(startDateStr);
			startDate.setUTCHours(0, 0, 0, 0);
			if (isNaN(startDate.getTime())) return [];
			if (endDateStr) {
				const endDate = new Date(endDateStr);
				endDate.setUTCHours(23, 59, 59, 999);
				if (!isNaN(endDate.getTime())) {
					return [{ $match: { [fieldName]: { $gte: startDate, $lte: endDate } } }];
				}
			}
			const endOfDay = new Date(startDate);
			endOfDay.setUTCHours(23, 59, 59, 999);
			return [{ $match: { [fieldName]: { $gte: startDate, $lte: endOfDay } } }];
		},
		// Sorts entries by the date field.
		sorts: async ({ field, sortDirection }) => ({
			[field.db_fieldName]: sortDirection
		})
	},
	// GraphQL schema for date
	GraphqlSchema: () => ({
		typeID: 'String',
		// ISO 8601 date string
		graphql: ''
		// No custom type definition needed
	})
});
const __vite_glob_0_1 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: DateWidget
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
const DateRangeValidationSchema = pipe(
	object({
		start: pipe(string(), minLength(1, 'Start date is required.'), isoDate()),
		end: pipe(string(), minLength(1, 'End date is required.'), isoDate())
	}),
	check((data) => new Date(data.start) <= new Date(data.end), 'End date must be on or after the start date.')
);
const DateRangeWidget = createWidget({
	Name: 'DateRange',
	Icon: 'mdi:calendar-range',
	Description: widget_daterange_description1(),
	// Define paths to the dedicated Svelte components.
	inputComponentPath: '/src/widgets/core/Daterange/Input.svelte',
	displayComponentPath: '/src/widgets/core/Daterange/Display.svelte',
	// Assign the validation schema.
	validationSchema: DateRangeValidationSchema,
	// Set widget-specific defaults.
	defaults: {
		translated: false
	},
	// Pass the GuiSchema directly into the widget's definition.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		icon: { widget: IconifyPicker, required: false },
		helper: { widget: Input, required: false },
		width: { widget: Input, required: false },
		permissions: { widget: PermissionsSetting, required: false }
	},
	// Define database aggregation logic for date ranges.
	aggregations: {
		/**
		 * Filters for entries where the provided date falls within the entry's date range.
		 * Expects filter string format: "YYYY-MM-DD"
		 */
		filters: async ({ field, filter }) => {
			const fieldName = field.db_fieldName;
			const filterDate = new Date(filter);
			if (isNaN(filterDate.getTime())) return [];
			return [
				{
					$match: {
						[`${fieldName}.start`]: { $lte: filterDate },
						[`${fieldName}.end`]: { $gte: filterDate }
					}
				}
			];
		},
		// Sorting will be based on the start date of the range.
		sorts: async ({ field, sortDirection }) => ({
			[`${field.db_fieldName}.start`]: sortDirection
		})
	}
});
const __vite_glob_0_2 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: DateRangeWidget
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
const GroupValidationSchema = object({});
const GroupWidget = createWidget({
	Name: 'Group',
	Icon: 'mdi:folder-outline',
	Description: 'Group related fields together',
	// Define paths to the dedicated Svelte components.
	inputComponentPath: '/src/widgets/core/Group/Input.svelte',
	displayComponentPath: '/src/widgets/core/Group/Display.svelte',
	// Assign the validation schema.
	validationSchema: GroupValidationSchema,
	// Set widget-specific defaults.
	defaults: {
		collapsible: false,
		collapsed: false,
		variant: 'default'
	},
	// Pass the GuiSchema directly into the widget's definition.
	GuiSchema: {
		label: { widget: Input, required: true },
		groupTitle: { widget: Input, required: false },
		collapsible: { widget: Toggles, required: false },
		collapsed: { widget: Toggles, required: false },
		variant: { widget: Input, required: false },
		db_fieldName: { widget: Input, required: false },
		icon: { widget: IconifyPicker, required: false },
		helper: { widget: Input, required: false },
		width: { widget: Input, required: false },
		permissions: { widget: PermissionsSetting, required: false }
	},
	// Groups don't typically need database aggregations as they contain other widgets
	aggregations: {}
});
const __vite_glob_0_3 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: GroupWidget
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
const createValidationSchema$1 = (field) => {
	const stringRules = [transform((s) => (typeof s === 'string' ? s.trim() : s))];
	if (field.required) stringRules.push(minLength(1, 'This field is required.'));
	if (field.minLength) stringRules.push(minLength(field.minLength, `Must be at least ${field.minLength} characters.`));
	if (field.maxLength) stringRules.push(maxLength(field.maxLength, `Must be no more than ${field.maxLength} characters.`));
	const schema = pipe(string(), ...stringRules);
	if (field.translated) {
		return optional(record(string(), string()), {});
	}
	return field.required ? schema : optional(schema, '');
};
const InputWidget = createWidget({
	Name: 'Input',
	Icon: 'mdi:form-textbox',
	Description: widget_text_description(),
	inputComponentPath: '/src/widgets/core/Input/Input.svelte',
	displayComponentPath: '/src/widgets/core/Input/Display.svelte',
	validationSchema: createValidationSchema$1,
	// Set widget-specific defaults.
	defaults: {
		translated: true
	},
	// Define the UI for configuring this widget in the Collection Builder.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		translated: { widget: Toggles, required: false },
		icon: { widget: IconifyPicker, required: false },
		helper: { widget: Input, required: false },
		width: { widget: Input, required: false },
		permissions: { widget: PermissionsSetting, required: false },
		placeholder: { widget: Input, required: false },
		minLength: { widget: Input, required: false },
		maxLength: { widget: Input, required: false },
		prefix: { widget: Input, required: false },
		suffix: { widget: Input, required: false },
		count: { widget: Input, required: false }
	},
	// Aggregations for text search and sorting.
	aggregations: {
		filters: async ({ field, filter, contentLanguage }) => [
			{ $match: { [`${field.db_fieldName}.${contentLanguage}`]: { $regex: filter, $options: 'i' } } }
		],
		sorts: async ({ field, sortDirection, contentLanguage }) => ({
			[`${field.db_fieldName}.${contentLanguage}`]: sortDirection
		})
	},
	// GraphQL schema for text input
	GraphqlSchema: () => ({
		typeID: 'String',
		// Use primitive String type
		graphql: ''
		// No custom type definition needed for primitives
	})
});
const __vite_glob_0_4 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			createValidationSchema: createValidationSchema$1,
			default: InputWidget
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
const createValidationSchema = (field) => {
	const idSchema = pipe(string(), minLength(1, 'A media file is required.'));
	if (field.multiupload) {
		const arraySchema = array(idSchema);
		return field.required ? pipe(arraySchema, minLength(1, 'At least one media file is required.')) : optional(arraySchema);
	}
	return field.required ? idSchema : optional(idSchema, '');
};
const MediaWidget = createWidget({
	Name: 'MediaUpload',
	Icon: 'mdi:image-multiple',
	Description: widget_media_description(),
	inputComponentPath: '/src/widgets/core/MediaUpload/Input.svelte',
	displayComponentPath: '/src/widgets/core/MediaUpload/Display.svelte',
	validationSchema: createValidationSchema,
	// Set widget-specific defaults.
	defaults: {
		multiupload: false,
		allowedTypes: []
	},
	GuiSchema: {
		multiupload: { widget: CheckboxWidget, label: 'Allow Multiple Files' },
		watermark: {
			widget: 'group',
			label: 'Watermark Options',
			fields: {
				text: { widget: InputWidget, label: 'Watermark Text' },
				position: { widget: InputWidget, label: 'Position (e.g., center, top-right)' },
				opacity: { widget: InputWidget, label: 'Opacity (0-1)' },
				scale: { widget: InputWidget, label: 'Scale (e.g., 0.5 for 50%)' }
			}
		}
	},
	// Aggregation performs a lookup to search by the actual media file name.
	aggregations: {
		filters: async ({ field, filter }) => [
			// Join with the 'media_files' collection.
			{
				$lookup: {
					from: 'media_files',
					localField: field.db_fieldName,
					foreignField: '_id',
					as: 'media_docs'
				}
			},
			// Filter based on the name of the joined media files.
			{
				$match: {
					'media_docs.name': { $regex: filter, $options: 'i' }
				}
			}
		]
		// Sorting would follow a similar `$lookup` pattern.
	}
});
const __vite_glob_0_5 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			createValidationSchema,
			default: MediaWidget
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
const MenuItemSchema = object({
	_id: pipe(string(), maxLength(100)),
	_fields: object({}),
	// The fields inside validated separately
	children: array(object({}))
	// Nested children with same structure
});
const MegaMenuValidationSchema = array(MenuItemSchema);
const MegaMenuWidget = createWidget({
	Name: 'MegaMenu',
	Icon: 'lucide:menu-square',
	Description: widget_megamenu_description1(),
	// Define paths to the dedicated Svelte components.
	inputComponentPath: '/src/widgets/core/megamenu/Input.svelte',
	displayComponentPath: '/src/widgets/core/megamenu/Display.svelte',
	// Assign the validation schema.
	validationSchema: MegaMenuValidationSchema,
	// Set widget-specific defaults.
	defaults: {
		fields: [],
		maxDepth: 5,
		enableDragDrop: true,
		enableExpandCollapse: true
	}
});
const traverseMenuItems = (items, callback, level = 0, parent) => {
	items.forEach((item) => {
		callback(item, level, parent);
		if (item.children && item.children.length > 0) {
			traverseMenuItems(item.children, callback, level + 1, item);
		}
	});
};
const findMenuItemByPath = (items, path) => {
	let currentItems = items;
	let targetItem = null;
	for (const index of path) {
		if (index >= 0 && index < currentItems.length) {
			targetItem = currentItems[index];
			currentItems = targetItem.children;
		} else {
			return null;
		}
	}
	return targetItem;
};
const validateMenuStructure = (items, config) => {
	const errors = [];
	const maxDepth = config.maxDepth || 5;
	const checkDepth = (item, currentDepth = 0) => {
		if (currentDepth > maxDepth) {
			errors.push(`Menu item "${item._fields?.title || item._id}" exceeds maximum depth of ${maxDepth}`);
		}
		item.children.forEach((child) => checkDepth(child, currentDepth + 1));
	};
	const checkConstraints = (item) => {
		const childrenCount = item.children.length;
		const maxChildren = config.validationRules?.maxChildrenPerParent;
		if (maxChildren && childrenCount > maxChildren) {
			errors.push(`Menu item "${item._fields?.title || item._id}" has ${childrenCount} children, maximum allowed is ${maxChildren}`);
		}
		item.children.forEach(checkConstraints);
	};
	items.forEach((item) => {
		checkDepth(item);
		checkConstraints(item);
	});
	return {
		valid: errors.length === 0,
		errors
	};
};
const __vite_glob_0_6 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: MegaMenuWidget,
			findMenuItemByPath,
			traverseMenuItems,
			validateMenuStructure
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
const validationSchema$9 = (field) => {
	const allowedValues = field.options?.map((opt) => literal(opt.value)) || [];
	const schema = union([...allowedValues], 'Please select a valid option.');
	return field.required ? schema : optional(schema);
};
const RadioWidget = createWidget({
	Name: 'Radio',
	Icon: 'mdi:radiobox-marked',
	Description: widget_radio_description(),
	// Define paths to the dedicated Svelte components.
	inputComponentPath: '/src/widgets/core/Radio/Input.svelte',
	displayComponentPath: '/src/widgets/core/Radio/Display.svelte',
	// Assign the dynamic validation schema.
	validationSchema: validationSchema$9,
	// Set widget-specific defaults.
	defaults: {
		options: [],
		translated: false,
		// A single selection is not typically translated.
		legend: ''
	},
	// GuiSchema allows a simple text area for defining options in the collection builder.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		legend: { widget: Input, required: false, helper: 'Legend text for the radio group' },
		options: {
			widget: Input,
			// Using a simple textarea for JSON/JS array input
			required: true,
			helper: "Enter an array of objects, e.g., [{label: 'First', value: 1}, {label: 'Second', value: 2}]"
		}
	},
	// GraphQL schema for radio
	GraphqlSchema: () => ({
		typeID: 'String',
		// Radio value as string
		graphql: ''
		// No custom type definition needed
	})
});
const __vite_glob_0_7 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: RadioWidget
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
function CollectionPicker($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { value = '' } = $$props;
		const collectionNames = Object.values(collections.all).map((c) => c.name);
		$$renderer2.push(
			`<div class="m-1 flex max-w-full items-center justify-between gap-2"><label for="collection-select" class="w-32 flex-none">Collection</label> `
		);
		$$renderer2.select(
			{
				id: 'collection-select',
				class: 'input grow text-black dark:text-primary-500',
				value
			},
			($$renderer3) => {
				$$renderer3.option({ value: '' }, ($$renderer4) => {
					$$renderer4.push(`Select a collection`);
				});
				$$renderer3.push(`<!--[-->`);
				const each_array = ensure_array_like(collectionNames);
				for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
					let name = each_array[$$index];
					$$renderer3.option({ value: name }, ($$renderer4) => {
						$$renderer4.push(`${escape_html(name)}`);
					});
				}
				$$renderer3.push(`<!--]-->`);
			}
		);
		$$renderer2.push(`</div>`);
		bind_props($$props, { value });
	});
}
function FieldPicker($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { value = '', collection = '' } = $$props;
		const selectedCollection = Object.values(collections.all).find((c) => c.name === collection);
		const fieldNames = selectedCollection?.fields?.map((f) => f.db_fieldName).filter(Boolean) || [];
		$$renderer2.push(
			`<div class="m-1 flex max-w-full items-center justify-between gap-2"><label for="field-select" class="w-32 flex-none">Display Field</label> `
		);
		$$renderer2.select(
			{
				id: 'field-select',
				class: 'input grow text-black dark:text-primary-500',
				value,
				disabled: !collection
			},
			($$renderer3) => {
				$$renderer3.option({ value: '' }, ($$renderer4) => {
					$$renderer4.push(`Select a field`);
				});
				$$renderer3.push(`<!--[-->`);
				const each_array = ensure_array_like(fieldNames);
				for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
					let name = each_array[$$index];
					$$renderer3.option({ value: name }, ($$renderer4) => {
						$$renderer4.push(`${escape_html(name)}`);
					});
				}
				$$renderer3.push(`<!--]-->`);
			}
		);
		$$renderer2.push(`</div>`);
		bind_props($$props, { value });
	});
}
const validationSchema$8 = (field) => {
	const idSchema = pipe(string(), minLength(1, 'An entry must be selected.'));
	return field.required ? idSchema : optional(idSchema, '');
};
const RelationWidget = createWidget({
	Name: 'Relation',
	Icon: 'mdi:relation-one-to-one',
	Description: widget_relation_description(),
	inputComponentPath: '/src/widgets/core/Relation/Input.svelte',
	displayComponentPath: '/src/widgets/core/Relation/Display.svelte',
	validationSchema: validationSchema$8,
	// Define the UI for configuring this widget in the Collection Builder.
	GuiSchema: {
		// Standard fields
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		icon: { widget: IconifyPicker, required: false },
		helper: { widget: Input, required: false },
		width: { widget: Input, required: false },
		permissions: { widget: PermissionsSetting, required: false },
		// Widget-specific fields
		collection: {
			widget: CollectionPicker,
			// A dropdown to select a collection
			required: true
		},
		displayField: {
			widget: FieldPicker,
			// A dropdown to select a field from the chosen collection
			required: true
		}
	},
	defaults: {
		translated: false
	},
	// Aggregation performs a lookup to search by the related entry's displayField.
	// SECURITY: Includes tenant isolation to prevent IDOR attacks
	aggregations: {
		filters: async ({ field, filter, tenantId }) => [
			{ $lookup: { from: field.collection, localField: field.db_fieldName, foreignField: '_id', as: 'related_doc' } },
			{
				$match: {
					...(tenantId ? { 'related_doc.tenantId': tenantId } : {}),
					[`related_doc.${field.displayField}`]: { $regex: filter, $options: 'i' }
				}
			}
		],
		sorts: async ({ field, sortDirection }) => {
			return {
				[`${field.db_fieldName}.${field.displayField}`]: sortDirection
			};
		}
	},
	// GraphQL schema for relation (returns ID of related document)
	GraphqlSchema: () => ({
		typeID: 'String',
		// Related document ID
		graphql: ''
		// No custom type definition needed
	})
});
const __vite_glob_0_8 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: RelationWidget
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
const stripHtmlTags = (html) => {
	if (!html) return '';
	let previous;
	let current = html;
	do {
		previous = current;
		current = current.replace(/<[^>]*>/g, '');
	} while (current !== previous);
	current = current.replace(/[<>]/g, '');
	return current;
};
const isContentEmpty = (html) => {
	if (!html) return true;
	const stripped = stripHtmlTags(html).trim();
	return stripped.length === 0;
};
const validationSchema$7 = (field) => {
	const schema = object({
		title: optional(string()),
		// Title can be optional.
		content: string()
		// HTML content.
	});
	if (field.required) {
		return object({
			title: optional(string()),
			content: pipe(
				string(),
				custom((input) => !isContentEmpty(input), 'Content is required.')
			)
		});
	}
	return optional(schema);
};
const RichTextWidget = createWidget({
	Name: 'RichText',
	Icon: 'mdi:format-pilcrow-arrow-right',
	Description: widget_richtext_description1(),
	// Define paths to the dedicated Svelte components.
	inputComponentPath: '/src/widgets/core/RichText/Input.svelte',
	displayComponentPath: '/src/widgets/core/RichText/Display.svelte',
	// Assign the validation schema function.
	validationSchema: validationSchema$7,
	// Set widget-specific defaults.
	defaults: {
		// Provide a default full toolbar configuration.
		toolbar: ['bold', 'italic', 'headings', 'lists', 'link', 'image', 'align', 'clear'],
		translated: true
	}
});
const __vite_glob_0_9 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: RichTextWidget
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
const AddressValidationSchema = object({
	street: pipe(string(), minLength(1, 'Street is required.')),
	houseNumber: string(),
	postalCode: pipe(string(), minLength(1, 'Postal code is required.')),
	city: pipe(string(), minLength(1, 'City is required.')),
	country: pipe(string(), minLength(2, 'Country is required.')),
	latitude: number(),
	longitude: number()
});
const AddressWidget = createWidget({
	Name: 'Address',
	Icon: 'mdi:home-map-marker',
	Description: widget_address_description(),
	inputComponentPath: '/src/widgets/custom/Address/Input.svelte',
	displayComponentPath: '/src/widgets/custom/Address/Display.svelte',
	validationSchema: AddressValidationSchema,
	// Define the UI for configuring this widget's properties in the Collection Builder.
	GuiSchema: {
		// Standard fields
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		width: { widget: Input, required: false },
		// Widget-specific fields from AddressProps
		defaultCountry: {
			widget: Input,
			required: false,
			helper: "Default 2-letter country code (e.g., 'DE', 'US')."
		},
		mapCenter: {
			widget: Input,
			required: false,
			helper: "Default map center (e.g., '51.34,6.57')."
		},
		zoom: { widget: Input, required: false, helper: 'Default map zoom level (e.g., 12).' },
		hiddenFields: {
			widget: Input,
			required: false,
			helper: "Comma-separated list of fields to hide (e.g., 'latitude,longitude')."
		}
	},
	// Set widget-specific defaults.
	defaults: {
		mapCenter: { lat: 51.34, lng: 6.57 },
		zoom: 12,
		defaultCountry: 'DE',
		hiddenFields: [],
		translated: false
	},
	getTranslatablePaths: (basePath) => {
		return [`${basePath}.street`, `${basePath}.postalCode`, `${basePath}.city`, `${basePath}.country`];
	}
});
const __vite_glob_1_0 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: AddressWidget
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
const validationSchema$6 = (field) => {
	const hexSchema = pipe(string(), regex(/^#[0-9a-f]{6}$/i, 'Must be a valid 6-digit hex code (e.g., #FF5733).'));
	if (field.required) {
		return pipe(string(), minLength(1, 'A color is required.'), hexSchema);
	}
	return optional(hexSchema, '');
};
const ColorPickerWidget = createWidget({
	Name: 'ColorPicker',
	Icon: 'ic:outline-colorize',
	Description: widget_colorpicker_description1(),
	inputComponentPath: '/src/widgets/custom/ColorPicker/Input.svelte',
	displayComponentPath: '/src/widgets/custom/ColorPicker/Display.svelte',
	validationSchema: validationSchema$6,
	// Set widget-specific defaults. A color is a universal value.
	defaults: {
		translated: false
	},
	// Define the UI for configuring this widget in the Collection Builder.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		width: { widget: Input, required: false }
	}
});
const __vite_glob_1_1 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: ColorPickerWidget
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
const validationSchema$5 = (field) => {
	const validationActions = [];
	if (field.minValue !== void 0) {
		validationActions.push(minValue(field.minValue, `Value must be at least ${field.minValue}.`));
	}
	if (field.maxValue !== void 0) {
		validationActions.push(maxValue(field.maxValue, `Value must not exceed ${field.maxValue}.`));
	}
	const baseSchema = number('Value must be a number.');
	const schema = validationActions.length > 0 ? pipe(baseSchema, ...validationActions) : baseSchema;
	return field.required ? schema : optional(schema);
};
const CurrencyWidget = createWidget({
	Name: 'Currency',
	Icon: 'mdi:currency-usd',
	Description: widget_currency_description(),
	inputComponentPath: '/src/widgets/custom/Currency/Input.svelte',
	displayComponentPath: '/src/widgets/custom/Currency/Display.svelte',
	validationSchema: validationSchema$5,
	// Set widget-specific defaults.
	defaults: {
		currencyCode: 'EUR',
		translated: false
		// A monetary value is typically not translated.
	},
	// SECURITY: Validate ISO 4217 currency codes
	// validCurrencyCodes: ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD', 'CHF', 'HKD', 'SGD', 'SEK', 'NOK', 'NZD', 'KRW', 'TRY', 'INR', 'BRL', 'ZAR'],
	// GuiSchema allows configuration in the collection builder.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		currencyCode: {
			widget: Input,
			required: true,
			helper: 'ISO 4217 code (USD, EUR, GBP, etc.)',
			pattern: '^[A-Z]{3}$'
		},
		minValue: { widget: Input, required: false },
		maxValue: { widget: Input, required: false },
		placeholder: { widget: Input, required: false }
	},
	// Aggregations perform numeric comparisons.
	aggregations: {
		filters: async ({ field, filter }) => [
			// Example: filter=">100" or filter="<50" or filter="150"
			// This requires a simple parser for the filter string.
			{ $match: { [field.db_fieldName]: { $eq: parseFloat(filter) } } }
			// Simplified for exact match
		],
		sorts: async ({ field, sortDirection }) => ({
			[field.db_fieldName]: sortDirection
		})
	},
	// GraphQL schema for currency
	GraphqlSchema: () => ({
		typeID: 'Float',
		// Use Float for currency values
		graphql: ''
		// No custom type definition needed
	})
});
const __vite_glob_1_2 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: CurrencyWidget
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
const DISPOSABLE_DOMAINS = [
	'tempmail.com',
	'guerrillamail.com',
	'10minutemail.com',
	'mailinator.com',
	'throwaway.email',
	'yopmail.com',
	'temp-mail.org',
	'getnada.com'
];
const blockDisposableEmail = custom((input) => {
	if (typeof input !== 'string') return false;
	const domain = input.split('@')[1]?.toLowerCase();
	return !DISPOSABLE_DOMAINS.includes(domain);
}, 'Disposable email addresses are not allowed');
const validationSchema$4 = (field) => {
	const baseSchema = pipe(string(), email('Please enter a valid email address.'), blockDisposableEmail);
	const schema = field.required
		? pipe(string(), minLength(1, 'This field is required.'), email('Please enter a valid email address.'), blockDisposableEmail)
		: baseSchema;
	return field.required ? schema : optional(schema, '');
};
const EmailWidget = createWidget({
	Name: 'Email',
	Icon: 'ic:outline-email',
	Description: widget_email_description(),
	inputComponentPath: '/src/widgets/custom/Email/Input.svelte',
	displayComponentPath: '/src/widgets/custom/Email/Display.svelte',
	validationSchema: validationSchema$4,
	// Set widget-specific defaults.
	defaults: {
		translated: false
		// An email address should not be translatable.
	},
	// Define the UI for configuring this widget in the Collection Builder.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		placeholder: { widget: Input, required: false }
	},
	// GraphQL schema for email input
	GraphqlSchema: () => ({
		typeID: 'String',
		// Use primitive String type
		graphql: ''
		// No custom type definition needed for primitives
	})
});
const __vite_glob_1_3 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: EmailWidget
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
const validationSchema$3 = (field) => {
	const validationActions = [];
	if (field.min !== void 0) {
		validationActions.push(minValue(field.min, `Value must be at least ${field.min}.`));
	}
	if (field.max !== void 0) {
		validationActions.push(maxValue(field.max, `Value must not exceed ${field.max}.`));
	}
	const baseSchema = number('Value must be a number.');
	const schema = validationActions.length > 0 ? pipe(baseSchema, ...validationActions) : baseSchema;
	return field.required ? schema : optional(schema);
};
const NumberWidget = createWidget({
	Name: 'Number',
	Icon: 'mdi:numeric',
	Description: widget_number_description(),
	inputComponentPath: '/src/widgets/custom/Number/Input.svelte',
	displayComponentPath: '/src/widgets/custom/Number/Display.svelte',
	validationSchema: validationSchema$3,
	// Set widget-specific defaults.
	defaults: {
		step: 1,
		translated: false
		// A number is a universal value.
	},
	// GuiSchema allows configuration in the collection builder.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		min: { widget: Input, required: false, helper: 'Minimum allowed value.' },
		max: { widget: Input, required: false, helper: 'Maximum allowed value.' },
		step: { widget: Input, required: false, helper: 'Stepping interval.' },
		placeholder: { widget: Input, required: false }
	},
	// Aggregations perform numeric comparisons.
	aggregations: {
		filters: async ({ field, filter }) => [
			// Example: filter=">100" or filter="<50" or filter="150"
			{ $match: { [field.db_fieldName]: { $eq: parseFloat(filter) } } }
		],
		sorts: async ({ field, sortDirection }) => ({
			[field.db_fieldName]: sortDirection
		})
	},
	// GraphQL schema for number
	GraphqlSchema: () => ({
		typeID: 'Float',
		// Use Float for numeric values
		graphql: ''
		// No custom type definition needed
	})
});
const __vite_glob_1_4 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: NumberWidget
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
const validationSchema$2 = (field) => {
	const defaultPattern = /^\+[1-9]\d{1,3}[\d\s-]{4,14}$/;
	const validationMessage = 'Please enter a valid international phone number (e.g., +49 123 456789)';
	const validationPattern = field.pattern ? new RegExp(field.pattern) : defaultPattern;
	const baseSchema = pipe(string(), regex(validationPattern, validationMessage));
	const schema = field.required ? pipe(string(), minLength(1, 'This field is required.'), regex(validationPattern, validationMessage)) : baseSchema;
	return field.required ? schema : optional(schema, '');
};
const PhoneNumberWidget = createWidget({
	Name: 'PhoneNumber',
	Icon: 'ic:baseline-phone-in-talk',
	Description: widget_phonenumber_description1(),
	inputComponentPath: '/src/widgets/custom/PhoneNumber/Input.svelte',
	displayComponentPath: '/src/widgets/custom/PhoneNumber/Display.svelte',
	validationSchema: validationSchema$2,
	// Set widget-specific defaults.
	defaults: {
		translated: false
		// A phone number should not be translatable.
	},
	// Define the UI for configuring this widget in the Collection Builder.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		placeholder: { widget: Input, required: false },
		pattern: { widget: Input, required: false, helper: 'Optional: Custom regex for validation.' }
	}
});
const __vite_glob_1_5 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: PhoneNumberWidget
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
const validationSchema$1 = (field) => {
	const max = field.max || 5;
	const schema = pipe(number('Rating must be a number.'), minValue(1, 'A rating is required.'), maxValue(max, `Rating cannot exceed ${max}.`));
	return field.required ? schema : optional(schema);
};
const RatingWidget = createWidget({
	Name: 'Rating',
	Icon: 'material-symbols:star-outline',
	Description: widget_rating_description(),
	inputComponentPath: '/src/widgets/custom/Rating/Input.svelte',
	displayComponentPath: '/src/widgets/custom/Rating/Display.svelte',
	validationSchema: validationSchema$1,
	// Set widget-specific defaults.
	defaults: {
		max: 5,
		iconFull: 'material-symbols:star',
		iconEmpty: 'material-symbols:star-outline',
		translated: false
	},
	// GuiSchema allows configuration in the collection builder.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		max: { widget: Input, required: false, helper: 'Maximum number of stars.' },
		iconFull: { widget: IconifyPicker, required: false },
		iconEmpty: { widget: IconifyPicker, required: false }
	},
	// Aggregations perform numeric comparisons.
	aggregations: {
		filters: async ({ field, filter }) => [{ $match: { [field.db_fieldName]: { $eq: parseInt(filter, 10) } } }],
		sorts: async ({ field, sortDirection }) => ({
			[field.db_fieldName]: sortDirection
		})
	},
	// GraphQL schema for rating
	GraphqlSchema: () => ({
		typeID: 'Int',
		// Use Int for rating values
		graphql: ''
		// No custom type definition needed
	})
});
const __vite_glob_1_6 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: RatingWidget
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
const SAFE_VIDEO_URL_PATTERNS = [
	/^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
	/^https?:\/\/(www\.)?vimeo\.com\/\d+$/,
	/^https?:\/\/(www\.)?twitch\.tv\/videos\/\d+$/,
	/^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+$/
];
const RemoteVideoDataSchema = object({
	platform: union([literal('youtube'), literal('vimeo'), literal('twitch'), literal('tiktok'), literal('other')]),
	url: pipe(
		string(),
		url('Must be a valid video URL.'),
		custom((input) => {
			const str = input;
			return SAFE_VIDEO_URL_PATTERNS.some((pattern) => pattern.test(str));
		}, 'URL must be from an allowed video platform (YouTube, Vimeo, Twitch, or TikTok)')
	),
	videoId: pipe(string(), minLength(1, 'Video ID is required.')),
	title: pipe(string(), minLength(1, 'Video title is required.')),
	thumbnailUrl: pipe(string(), url('Must be a valid thumbnail URL.')),
	channelTitle: optional(string()),
	duration: optional(string()),
	width: optional(number()),
	height: optional(number()),
	publishedAt: optional(string())
});
const validationSchema = RemoteVideoDataSchema;
const RemoteVideoWidget = createWidget({
	Name: 'RemoteVideo',
	Icon: 'mdi:video-vintage',
	Description: widget_remotevideo_description1(),
	inputComponentPath: '/src/widgets/custom/RemoteVideo/Input.svelte',
	displayComponentPath: '/src/widgets/custom/RemoteVideo/Display.svelte',
	validationSchema,
	// Set widget-specific defaults.
	defaults: {
		placeholder: 'Enter video URL (YouTube, Vimeo, Twitch, TikTok)',
		allowedPlatforms: ['youtube', 'vimeo', 'twitch', 'tiktok'],
		translated: false
		// Video metadata is not typically translated per-field.
	},
	// Define the UI for configuring this widget in the Collection Builder.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		placeholder: { widget: Input, required: false },
		allowedPlatforms: {
			widget: Input,
			// A multi-select component would be better here in a real CMS.
			required: false,
			helper: "Comma-separated platforms (e.g., 'youtube,vimeo')."
		}
	},
	// Aggregations filter/sort by video title.
	aggregations: {
		filters: async ({ field, filter }) => [{ $match: { [`${field.db_fieldName}.title`]: { $regex: filter, $options: 'i' } } }],
		sorts: async ({ field, sortDirection }) => ({
			[`${field.db_fieldName}.title`]: sortDirection
		})
	},
	// Define the GraphQL schema for the RemoteVideoData object.
	GraphqlSchema: ({ label }) => ({
		typeID: label,
		// Using the label as the GraphQL type name.
		graphql: `
            type ${label} {
                platform: String!
                url: String!
                videoId: String!
                title: String!
                thumbnailUrl: String!
                channelTitle: String
                duration: String
                width: Int
                height: Int
                publishedAt: String
            }
        `
	})
});
const __vite_glob_1_7 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: RemoteVideoWidget
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
const escapeHtml = (str) => {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
};
const SeoValidationSchema = object({
	title: pipe(string(), maxLength(60, 'Title should be under 60 characters.'), transform(escapeHtml)),
	description: pipe(string(), maxLength(160, 'Description should be under 160 characters.'), transform(escapeHtml)),
	focusKeyword: pipe(string(), transform(escapeHtml)),
	// Advanced
	robotsMeta: pipe(string(), transform(escapeHtml)),
	canonicalUrl: optional(pipe(string(), url('Must be a valid URL.'), regex(/^https?:\/\//, 'Must use HTTP or HTTPS protocol'))),
	// Social
	ogTitle: optional(string()),
	ogDescription: optional(string()),
	ogImage: optional(string()),
	// ID of a media file
	twitterCard: union([literal('summary'), literal('summary_large_image')]),
	twitterTitle: optional(string()),
	twitterDescription: optional(string()),
	twitterImage: optional(string()),
	// ID of a media file
	// Schema - SECURITY: Validate JSON structure
	schemaMarkup: optional(
		pipe(
			string(),
			custom((input) => {
				if (!input) return true;
				try {
					const parsed = JSON.parse(input);
					return typeof parsed === 'object' && !Array.isArray(parsed);
				} catch {
					return false;
				}
			}, 'Must be valid JSON object')
		)
	)
});
const SeoWidget = createWidget({
	Name: 'SEO',
	Icon: 'tabler:seo',
	Description: widget_seo_description(),
	inputComponentPath: '/src/widgets/custom/Seo/Input.svelte',
	displayComponentPath: '/src/widgets/custom/Seo/Display.svelte',
	validationSchema: SeoValidationSchema,
	// Set widget-specific defaults.
	defaults: {
		features: ['social', 'schema', 'advanced', 'ai'],
		translated: true
	},
	// Validation - defines which fields are translatable
	getTranslatablePaths: (basePath) => {
		return [
			`${basePath}.title`,
			`${basePath}.description`,
			`${basePath}.focusKeyword`,
			`${basePath}.ogTitle`,
			`${basePath}.ogDescription`,
			`${basePath}.twitterTitle`,
			`${basePath}.twitterDescription`,
			`${basePath}.schemaMarkup`
		];
	},
	// GuiSchema allows configuration in the collection builder.
	GuiSchema: {
		label: { widget: Input, required: true },
		db_fieldName: { widget: Input, required: false },
		required: { widget: Toggles, required: false },
		translated: { widget: Toggles, required: false },
		features: {
			widget: Input,
			// A multi-select component would be better here.
			required: false,
			helper: 'Comma-separated features (social, schema, advanced, ai).'
		}
	},
	// GraphQL schema for SEO (complex object, would need custom type)
	// For now, return String to serialize as JSON
	GraphqlSchema: () => ({
		typeID: 'String',
		// JSON string representation
		graphql: ''
		// No custom type definition needed
	})
});
const __vite_glob_1_8 = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			default: SeoWidget
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
const coreModules = /* @__PURE__ */ Object.assign({
	'./core/Checkbox/index.ts': __vite_glob_0_0,
	'./core/Date/index.ts': __vite_glob_0_1,
	'./core/DateRange/index.ts': __vite_glob_0_2,
	'./core/Group/index.ts': __vite_glob_0_3,
	'./core/Input/index.ts': __vite_glob_0_4,
	'./core/MediaUpload/index.ts': __vite_glob_0_5,
	'./core/MegaMenu/index.ts': __vite_glob_0_6,
	'./core/Radio/index.ts': __vite_glob_0_7,
	'./core/Relation/index.ts': __vite_glob_0_8,
	'./core/RichText/index.ts': __vite_glob_0_9
});
const customModules = /* @__PURE__ */ Object.assign({
	'./custom/Address/index.ts': __vite_glob_1_0,
	'./custom/ColorPicker/index.ts': __vite_glob_1_1,
	'./custom/Currency/index.ts': __vite_glob_1_2,
	'./custom/Email/index.ts': __vite_glob_1_3,
	'./custom/Number/index.ts': __vite_glob_1_4,
	'./custom/PhoneNumber/index.ts': __vite_glob_1_5,
	'./custom/Rating/index.ts': __vite_glob_1_6,
	'./custom/RemoteVideo/index.ts': __vite_glob_1_7,
	'./custom/Seo/index.ts': __vite_glob_1_8
});
({ ...coreModules, ...customModules });
const scanner = /* @__PURE__ */ Object.freeze(
	/* @__PURE__ */ Object.defineProperty(
		{
			__proto__: null,
			coreModules,
			customModules
		},
		Symbol.toStringTag,
		{ value: 'Module' }
	)
);
export { IconifyPicker as I, customModules as a, createValidationSchema$1 as b, coreModules as c, scanner as s };
//# sourceMappingURL=scanner.js.map
