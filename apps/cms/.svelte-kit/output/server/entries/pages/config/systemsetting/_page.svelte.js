import {
	d as escape_html,
	e as ensure_array_like,
	a as attr,
	c as stringify,
	g as attr_class,
	m as store_get,
	u as unsubscribe_stores
} from '../../../../chunks/index5.js';
import { p as page } from '../../../../chunks/index6.js';
import '@sveltejs/kit/internal';
import '../../../../chunks/exports.js';
import '../../../../chunks/utils3.js';
import 'clsx';
import '@sveltejs/kit/internal/server';
import '../../../../chunks/state.svelte.js';
import { P as PageTitle } from '../../../../chunks/PageTitle.js';
import '../../../../chunks/logger.js';
import { w as writable } from '../../../../chunks/index4.js';
import '../../../../chunks/store.svelte.js';
import { g as getLanguageName } from '../../../../chunks/languageUtils.js';
import '../../../../chunks/runtime.js';
const groupsNeedingConfig = writable(/* @__PURE__ */ new Set());
const iso6391 = [
	{
		name: 'Afrikaans',
		code: 'af',
		native: 'Afrikaans'
	},
	{
		name: 'Albanian',
		code: 'sq',
		native: 'Shqip'
	},
	{
		name: 'Amharic',
		code: 'am',
		native: 'አማርኛ'
	},
	{
		name: 'Arabic',
		code: 'ar',
		native: 'العربية'
	},
	{
		name: 'Armenian',
		code: 'hy',
		native: 'Հայերեն'
	},
	{
		name: 'Azeerbaijani',
		code: 'az',
		native: 'azərbaycan dili'
	},
	{
		name: 'Basque',
		code: 'eu',
		native: 'euskara'
	},
	{
		name: 'Belarusian',
		code: 'be',
		native: 'беларуская мова'
	},
	{
		name: 'Bengali',
		code: 'bn',
		native: 'বাংলা'
	},
	{
		name: 'Bosnian',
		code: 'bs',
		native: 'bosanski jezik'
	},
	{
		name: 'Bulgarian',
		code: 'bg',
		native: 'български език'
	},
	{
		name: 'Catalan',
		code: 'ca',
		native: 'català'
	},
	{
		name: 'Cebuano',
		code: 'ceb',
		native: 'Cebuano'
	},
	{
		name: 'Chinese',
		code: 'zh',
		native: '中文'
	},
	{
		name: 'Corsican',
		code: 'co',
		native: 'corsu'
	},
	{
		name: 'Croatian',
		code: 'hr',
		native: 'hrvatski jezik'
	},
	{
		name: 'Czech',
		code: 'cs',
		native: 'čeština'
	},
	{
		name: 'Danish',
		code: 'da',
		native: 'dansk'
	},
	{
		name: 'Dutch',
		code: 'nl',
		native: 'Nederlands'
	},
	{
		name: 'English',
		code: 'en',
		native: 'English'
	},
	{
		name: 'Esperanto',
		code: 'eo',
		native: 'Esperanto'
	},
	{
		name: 'Estonian',
		code: 'et',
		native: 'eesti'
	},
	{
		name: 'Finnish',
		code: 'fi',
		native: 'suomi'
	},
	{
		name: 'French',
		code: 'fr',
		native: 'français'
	},
	{
		name: 'Frisian',
		code: 'fy',
		native: 'Frysk'
	},
	{
		name: 'Galician',
		code: 'gl',
		native: 'Galego'
	},
	{
		name: 'Georgian',
		code: 'ka',
		native: 'ქართული'
	},
	{
		name: 'German',
		code: 'de',
		native: 'Deutsch'
	},
	{
		name: 'Greek',
		code: 'el',
		native: 'ελληνικά'
	},
	{
		name: 'Gujarati',
		code: 'gu',
		native: 'ગુજરાતી'
	},
	{
		name: 'Haitian Creole',
		code: 'ht',
		native: 'Kreyòl ayisyen'
	},
	{
		name: 'Hausa',
		code: 'ha',
		native: 'هَوُسَ'
	},
	{
		name: 'Hawaiian',
		code: 'haw',
		native: 'ʻŌlelo Hawaiʻi'
	},
	{
		name: 'Hebrew',
		code: 'iw',
		native: 'עברית'
	},
	{
		name: 'Hindi',
		code: 'hi',
		native: 'हिन्दी, हिंदी'
	},
	{
		name: 'Hmong',
		code: 'hmn',
		native: 'Hmoob'
	},
	{
		name: 'Hungarian',
		code: 'hu',
		native: 'magyar'
	},
	{
		name: 'Icelandic',
		code: 'is',
		native: 'Íslenska'
	},
	{
		name: 'Igbo',
		code: 'ig',
		native: 'Asụsụ Igbo'
	},
	{
		name: 'Indonesian',
		code: 'id',
		native: 'Bahasa Indonesia'
	},
	{
		name: 'Irish',
		code: 'ga',
		native: 'Gaeilge'
	},
	{
		name: 'Italian',
		code: 'it',
		native: 'Italiano'
	},
	{
		name: 'Japanese',
		code: 'ja',
		native: '日本語'
	},
	{
		name: 'Javanese',
		code: 'jw',
		native: 'Basa Jawa'
	},
	{
		name: 'Kannada',
		code: 'kn',
		native: 'ಕನ್ನಡ'
	},
	{
		name: 'Kazakh',
		code: 'kk',
		native: 'қазақ тілі'
	},
	{
		name: 'Khmer',
		code: 'km',
		native: 'ខ្មែរ, ខេមរភាសា, ភាសាខ្មែរ'
	},
	{
		name: 'Korean',
		code: 'ko',
		native: '한국어'
	},
	{
		name: 'Kurdish',
		code: 'ku',
		native: 'Kurdî'
	},
	{
		name: 'Kyrgyz',
		code: 'ky',
		native: 'Кыргызча'
	},
	{
		name: 'Lao',
		code: 'lo',
		native: 'ພາສາລາວ'
	},
	{
		name: 'Latin',
		code: 'la',
		native: 'latine'
	},
	{
		name: 'Latvian',
		code: 'lv',
		native: 'Latviešu'
	},
	{
		name: 'Lithuanian',
		code: 'lt',
		native: 'lietuvių kalba'
	},
	{
		name: 'Luxembourgish',
		code: 'lb',
		native: 'Lëtzebuergesch'
	},
	{
		name: 'Macedonian',
		code: 'mk',
		native: 'македонски јазик'
	},
	{
		name: 'Malagasy',
		code: 'mg',
		native: 'fiteny malagasy'
	},
	{
		name: 'Malay',
		code: 'ms',
		native: 'بهاس ملايو'
	},
	{
		name: 'Malayalam',
		code: 'ml',
		native: 'മലയാളം'
	},
	{
		name: 'Maltese',
		code: 'mt',
		native: 'Malti'
	},
	{
		name: 'Maori',
		code: 'mi',
		native: 'te reo Māori'
	},
	{
		name: 'Marathi',
		code: 'mr',
		native: 'मराठी'
	},
	{
		name: 'Mongolian',
		code: 'mn',
		native: 'Монгол хэл'
	},
	{
		name: 'Myanmar',
		code: 'my',
		native: 'ဗမာစာ'
	},
	{
		name: 'Nepali',
		code: 'ne',
		native: 'नेपाली'
	},
	{
		name: 'Norwegian',
		code: 'no',
		native: 'Norsk'
	},
	{
		name: 'Nyanja',
		code: 'ny',
		native: 'chinyanja'
	},
	{
		name: 'Pashto',
		code: 'ps',
		native: 'پښتو'
	},
	{
		name: 'Persian',
		code: 'fa',
		native: 'فارسی'
	},
	{
		name: 'Polish',
		code: 'pl',
		native: 'język polski'
	},
	{
		name: 'Portuguese',
		code: 'pt',
		native: 'Português'
	},
	{
		name: 'Punjabi',
		code: 'pa',
		native: 'ਪੰਜਾਬੀ'
	},
	{
		name: 'Romanian',
		code: 'ro',
		native: 'Română'
	},
	{
		name: 'Russian',
		code: 'ru',
		native: 'Русский'
	},
	{
		name: 'Samoan',
		code: 'sm',
		native: "gagana fa'a Samoa"
	},
	{
		name: 'Scots Gaelic',
		code: 'gd',
		native: 'Gàidhlig'
	},
	{
		name: 'Serbian',
		code: 'sr',
		native: 'српски језик'
	},
	{
		name: 'Sesotho',
		code: 'st',
		native: 'Sesotho'
	},
	{
		name: 'Shona',
		code: 'sn',
		native: 'chiShona'
	},
	{
		name: 'Sindhi',
		code: 'sd',
		native: 'सिन्धी'
	},
	{
		name: 'Sinhala',
		code: 'si',
		native: 'සිංහල'
	},
	{
		name: 'Slovak',
		code: 'sk',
		native: 'Slovenčina'
	},
	{
		name: 'Slovenian',
		code: 'sl',
		native: 'Slovenski Jezik'
	},
	{
		name: 'Somali',
		code: 'so',
		native: 'Soomaaliga'
	},
	{
		name: 'Spanish',
		code: 'es',
		native: 'Español'
	},
	{
		name: 'Sundanese',
		code: 'su',
		native: 'Basa Sunda'
	},
	{
		name: 'Swahili',
		code: 'sw',
		native: 'Kiswahili'
	},
	{
		name: 'Swedish',
		code: 'sv',
		native: 'Svenska'
	},
	{
		name: 'Tagalog',
		code: 'tl',
		native: 'Wikang Tagalog'
	},
	{
		name: 'Tajik',
		code: 'tg',
		native: 'тоҷикӣ'
	},
	{
		name: 'Tamil',
		code: 'ta',
		native: 'தமிழ்'
	},
	{
		name: 'Telugu',
		code: 'te',
		native: 'తెలుగు'
	},
	{
		name: 'Thai',
		code: 'th',
		native: 'ไทย'
	},
	{
		name: 'Turkish',
		code: 'tr',
		native: 'Türkçe'
	},
	{
		name: 'Ukrainian',
		code: 'uk',
		native: 'Українська'
	},
	{
		name: 'Urdu',
		code: 'ur',
		native: 'اردو'
	},
	{
		name: 'Uzbek',
		code: 'uz',
		native: 'Ўзбек'
	},
	{
		name: 'Vietnamese',
		code: 'vi',
		native: 'Tiếng Việt'
	},
	{
		name: 'Welsh',
		code: 'cy',
		native: 'Cymraeg'
	},
	{
		name: 'Xhosa',
		code: 'xh',
		native: 'isiXhosa'
	},
	{
		name: 'Yiddish',
		code: 'yi',
		native: 'ייִדיש'
	},
	{
		name: 'Yoruba',
		code: 'yo',
		native: 'Yorùbá'
	},
	{
		name: 'Zulu',
		code: 'zu',
		native: 'isiZulu'
	}
];
function GenericSettingsGroup($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const LOG_LEVELS = ['none', 'fatal', 'error', 'warn', 'info', 'debug', 'trace'];
		const { group } = $$props;
		let saving = false;
		let values = {};
		let errors = {};
		const showPassword = {};
		const showLanguagePicker = {};
		const languageSearch = {};
		const showLogLevelPicker = {};
		let allowedLocales = [];
		function displayLanguage(code) {
			try {
				return getLanguageName(code);
			} catch {
				return code.toUpperCase();
			}
		}
		function getFieldIcon(field) {
			const key = field.key.toLowerCase();
			if (key.includes('email') || key.includes('smtp_user')) return 'mdi:email';
			if (key.includes('password') || key.includes('secret') || key.includes('token')) return 'mdi:lock';
			if (key.includes('host') || key.includes('url') || key.includes('domain')) return 'mdi:web';
			if (key.includes('port')) return 'mdi:power-plug';
			if (key.includes('database') || key.includes('db')) return 'mdi:database';
			if (key.includes('path') || key.includes('folder') || key.includes('directory')) return 'mdi:folder';
			if (key.includes('log') || key.includes('logging')) return 'mdi:math-log';
			if (key.includes('cache')) return 'mdi:cached';
			if (key.includes('timeout') || key.includes('duration') || key.includes('ttl')) return 'mdi:timer';
			if (key.includes('limit') || key.includes('max') || key.includes('min')) return 'mdi:speedometer';
			if (key.includes('enable') || key.includes('allow')) return 'mdi:toggle-switch';
			if (key.includes('jwt')) return 'mdi:key';
			if (key.includes('oauth') || key.includes('auth')) return 'mdi:shield-account';
			if (key.includes('redis')) return 'mdi:database-cog';
			if (key.includes('smtp')) return 'mdi:email-send';
			if (key.includes('site') || key.includes('name')) return 'mdi:web-box';
			if (key.includes('storage')) return 'mdi:harddisk';
			if (key.includes('backup')) return 'mdi:backup-restore';
			if (field.type === 'boolean') return 'mdi:checkbox-marked';
			if (field.type === 'number') return 'mdi:numeric';
			if (field.type === 'array') return 'mdi:format-list-bulleted';
			if (field.type === 'select') return 'mdi:form-dropdown';
			if (field.type === 'password') return 'mdi:lock';
			if (field.type === 'loglevel-multi') return 'mdi:math-log';
			return 'mdi:text-box';
		}
		function formatDuration(seconds) {
			if (seconds < 60) return `${seconds}s`;
			if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
			const hours = Math.floor(seconds / 3600);
			const mins = Math.floor((seconds % 3600) / 60);
			return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
		}
		function getArrayValue(key) {
			const val = values[key];
			if (Array.isArray(val)) {
				return val.join(', ');
			}
			return '';
		}
		$$renderer2.push(
			`<div class="space-y-4 max-w-full overflow-x-hidden"><div class="mb-6"><h2 class="mb-2 text-xl font-bold md:text-2xl"><span class="mr-2">${escape_html(group.icon)}</span> ${escape_html(group.name)}</h2> <p class="text-sm text-surface-600 dark:text-surface-300">${escape_html(group.description)}</p></div> `
		);
		if (group.requiresRestart) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="alert preset-filled-warning-500 mb-4 rounded-xl p-3 md:p-4"><div class="alert-message"><strong class="mb-1 block text-sm md:text-base">⚠️ Restart Required</strong> <p class="text-xs md:text-sm">Changes to these settings require a server restart to take effect.</p></div></div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		{
			$$renderer2.push('<!--[!-->');
			{
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--> <form class="space-y-4 md:space-y-6">`);
			if (group.id === 'languages') {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`<div class="grid grid-cols-1 gap-6 md:grid-cols-2"><!--[-->`);
				const each_array = ensure_array_like([null]);
				for (let $$index_3 = 0, $$length = each_array.length; $$index_3 < $$length; $$index_3++) {
					each_array[$$index_3];
					const defaultLangField = group.fields.find((f) => f.key === 'DEFAULT_CONTENT_LANGUAGE');
					const availableLangsField = group.fields.find((f) => f.key === 'AVAILABLE_CONTENT_LANGUAGES');
					$$renderer2.push(
						`<div class="space-y-3 rounded-md border border-slate-300/50 bg-surface-50/60 p-4 dark:border-slate-600/60 dark:bg-surface-800/40">`
					);
					if (defaultLangField) {
						$$renderer2.push('<!--[-->');
						$$renderer2.push(
							`<div><label${attr('for', defaultLangField.key)} class="mb-1 flex items-center gap-1 text-sm font-medium"><iconify-icon icon="mdi:book-open-page-variant" width="18" class="text-tertiary-500 dark:text-primary-500"></iconify-icon> <span>${escape_html(defaultLangField.label)}</span> `
						);
						if (defaultLangField.required) {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(`<span class="text-error-500">*</span>`);
						} else {
							$$renderer2.push('<!--[!-->');
						}
						$$renderer2.push(
							`<!--]--> <button type="button" class="ml-1 text-slate-400 hover:text-primary-500"${attr('data-tooltip', defaultLangField.description)} aria-label="Field information"><iconify-icon icon="mdi:help-circle-outline" width="16"></iconify-icon></button></label> `
						);
						$$renderer2.select(
							{
								id: defaultLangField.key,
								value: values[defaultLangField.key],
								class: `input w-full rounded ${stringify(errors[defaultLangField.key] ? 'border-error-500' : '')}`,
								required: defaultLangField.required,
								onchange: () => (errors[defaultLangField.key] = '')
							},
							($$renderer3) => {
								if (values.AVAILABLE_CONTENT_LANGUAGES?.length > 0) {
									$$renderer3.push('<!--[-->');
									$$renderer3.push(`<!--[-->`);
									const each_array_1 = ensure_array_like(values.AVAILABLE_CONTENT_LANGUAGES);
									for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
										let langCode = each_array_1[$$index];
										$$renderer3.option({ value: langCode }, ($$renderer4) => {
											$$renderer4.push(`${escape_html(displayLanguage(langCode))} (${escape_html(langCode)})`);
										});
									}
									$$renderer3.push(`<!--]-->`);
								} else {
									$$renderer3.push('<!--[!-->');
									$$renderer3.option({ value: 'en' }, ($$renderer4) => {
										$$renderer4.push(`English (en)`);
									});
								}
								$$renderer3.push(`<!--]-->`);
							}
						);
						$$renderer2.push(` `);
						if (errors[defaultLangField.key]) {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(`<div class="mt-1 text-xs text-error-500">${escape_html(errors[defaultLangField.key])}</div>`);
						} else {
							$$renderer2.push('<!--[!-->');
						}
						$$renderer2.push(`<!--]--></div>`);
					} else {
						$$renderer2.push('<!--[!-->');
					}
					$$renderer2.push(`<!--]--> `);
					if (availableLangsField) {
						$$renderer2.push('<!--[-->');
						$$renderer2.push(
							`<div><div class="mb-1 flex items-center gap-1 text-sm font-medium tracking-wide"><iconify-icon icon="mdi:book-multiple" width="14" class="text-tertiary-500 dark:text-primary-500"></iconify-icon> <span>${escape_html(availableLangsField.label)}</span> `
						);
						if (availableLangsField.required) {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(`<span class="text-error-500">*</span>`);
						} else {
							$$renderer2.push('<!--[!-->');
						}
						$$renderer2.push(
							`<!--]--> <button type="button" class="ml-1 text-slate-400 hover:text-primary-500"${attr('data-tooltip', availableLangsField.description)} aria-label="Field information"><iconify-icon icon="mdi:help-circle-outline" width="14"></iconify-icon></button></div> <div class="relative"><div${attr_class(`flex min-h-10 flex-wrap gap-2 rounded border p-2 pr-16 ${stringify(errors[availableLangsField.key] ? 'border-error-500 bg-error-50 dark:bg-error-900/20' : 'border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700/40')}`)}>`
						);
						if (values[availableLangsField.key]?.length > 0) {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(`<!--[-->`);
							const each_array_2 = ensure_array_like(values[availableLangsField.key]);
							for (let $$index_1 = 0, $$length2 = each_array_2.length; $$index_1 < $$length2; $$index_1++) {
								let langCode = each_array_2[$$index_1];
								$$renderer2.push(
									`<span class="group preset-ghost-tertiary-500 badge inline-flex items-center gap-1 rounded-full dark:preset-ghost-primary-500">${escape_html(displayLanguage(langCode))} (${escape_html(langCode)}) `
								);
								if (!availableLangsField.readonly) {
									$$renderer2.push('<!--[-->');
									$$renderer2.push(
										`<button type="button" class="opacity-60 transition hover:opacity-100"${attr('aria-label', `Remove ${stringify(langCode)}`)}>×</button>`
									);
								} else {
									$$renderer2.push('<!--[!-->');
								}
								$$renderer2.push(`<!--]--></span>`);
							}
							$$renderer2.push(`<!--]-->`);
						} else {
							$$renderer2.push('<!--[!-->');
							if (availableLangsField.placeholder) {
								$$renderer2.push('<!--[-->');
								$$renderer2.push(
									`<span class="text-surface-500 dark:text-surface-50 text-xs">${escape_html(availableLangsField.placeholder)}</span>`
								);
							} else {
								$$renderer2.push('<!--[!-->');
							}
							$$renderer2.push(`<!--]-->`);
						}
						$$renderer2.push(`<!--]--> `);
						if (!availableLangsField.readonly) {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(
								`<button type="button" class="preset-filled-surface-500 badge absolute right-2 top-2 rounded-full" aria-haspopup="dialog"${attr('aria-expanded', showLanguagePicker[availableLangsField.key])}${attr('aria-controls', `${stringify(availableLangsField.key)}-lang-picker`)}><iconify-icon icon="mdi:plus" width="14"></iconify-icon> Add</button>`
							);
						} else {
							$$renderer2.push('<!--[!-->');
						}
						$$renderer2.push(`<!--]--></div> `);
						if (showLanguagePicker[availableLangsField.key]) {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(
								`<div${attr('id', `${stringify(availableLangsField.key)}-lang-picker`)} class="absolute left-0 top-full z-20 mt-2 w-64 rounded-md border border-slate-300/60 bg-surface-50 p-2 shadow-lg dark:border-slate-600 dark:bg-surface-800" role="dialog" aria-label="Add language" tabindex="-1"><input class="mb-2 w-full rounded border border-slate-300/60 bg-transparent px-2 py-1 text-xs outline-none focus:border-primary-500 dark:border-slate-600" placeholder="Search..."${attr('value', languageSearch[availableLangsField.key])}/> <div class="max-h-48 overflow-auto">`
							);
							const each_array_3 = ensure_array_like(
								iso6391.filter((lang) => {
									const search = (languageSearch[availableLangsField.key] || '').toLowerCase();
									const currentValues = values[availableLangsField.key] || [];
									return (
										!currentValues.includes(lang.code) &&
										(search === '' ||
											lang.name.toLowerCase().includes(search) ||
											lang.native.toLowerCase().includes(search) ||
											lang.code.toLowerCase().includes(search))
									);
								})
							);
							if (each_array_3.length !== 0) {
								$$renderer2.push('<!--[-->');
								for (let $$index_2 = 0, $$length2 = each_array_3.length; $$index_2 < $$length2; $$index_2++) {
									let lang = each_array_3[$$index_2];
									$$renderer2.push(
										`<button type="button" class="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-primary-500/10"><span>${escape_html(lang.native)} (${escape_html(lang.code)})</span> <iconify-icon icon="mdi:plus-circle-outline" width="14" class="text-primary-500"></iconify-icon></button>`
									);
								}
							} else {
								$$renderer2.push('<!--[!-->');
								$$renderer2.push(`<p class="px-1 py-2 text-center text-[11px] text-slate-500">No matches</p>`);
							}
							$$renderer2.push(`<!--]--></div></div>`);
						} else {
							$$renderer2.push('<!--[!-->');
						}
						$$renderer2.push(`<!--]--></div> `);
						if (errors[availableLangsField.key]) {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(`<div class="mt-1 text-xs text-error-500">${escape_html(errors[availableLangsField.key])}</div>`);
						} else {
							$$renderer2.push('<!--[!-->');
						}
						$$renderer2.push(`<!--]--> `);
						if (availableLangsField.placeholder) {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(
								`<p class="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Example: ${escape_html(availableLangsField.placeholder)}</p>`
							);
						} else {
							$$renderer2.push('<!--[!-->');
						}
						$$renderer2.push(`<!--]--></div>`);
					} else {
						$$renderer2.push('<!--[!-->');
					}
					$$renderer2.push(`<!--]--></div>`);
				}
				$$renderer2.push(`<!--]--> <!--[-->`);
				const each_array_4 = ensure_array_like([null]);
				for (let $$index_7 = 0, $$length = each_array_4.length; $$index_7 < $$length; $$index_7++) {
					each_array_4[$$index_7];
					const baseLocaleField = group.fields.find((f) => f.key === 'BASE_LOCALE');
					const localesField = group.fields.find((f) => f.key === 'LOCALES');
					$$renderer2.push(
						`<div class="space-y-3 rounded-md border border-slate-300/50 bg-surface-50/60 p-4 dark:border-slate-600/60 dark:bg-surface-800/40">`
					);
					if (baseLocaleField) {
						$$renderer2.push('<!--[-->');
						$$renderer2.push(
							`<div><label${attr('for', baseLocaleField.key)} class="mb-1 flex items-center gap-1 text-sm font-medium"><iconify-icon icon="mdi:translate" width="18" class="text-tertiary-500 dark:text-primary-500"></iconify-icon> <span>${escape_html(baseLocaleField.label)}</span> `
						);
						if (baseLocaleField.required) {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(`<span class="text-error-500">*</span>`);
						} else {
							$$renderer2.push('<!--[!-->');
						}
						$$renderer2.push(
							`<!--]--> <button type="button" class="ml-1 text-slate-400 hover:text-primary-500"${attr('data-tooltip', baseLocaleField.description)} aria-label="Field information"><iconify-icon icon="mdi:help-circle-outline" width="16"></iconify-icon></button></label> `
						);
						$$renderer2.select(
							{
								id: baseLocaleField.key,
								value: values[baseLocaleField.key],
								class: `input w-full rounded ${stringify(errors[baseLocaleField.key] ? 'border-error-500' : '')}`,
								required: baseLocaleField.required,
								onchange: () => (errors[baseLocaleField.key] = '')
							},
							($$renderer3) => {
								if (values.LOCALES?.length > 0) {
									$$renderer3.push('<!--[-->');
									$$renderer3.push(`<!--[-->`);
									const each_array_5 = ensure_array_like(values.LOCALES);
									for (let $$index_4 = 0, $$length2 = each_array_5.length; $$index_4 < $$length2; $$index_4++) {
										let langCode = each_array_5[$$index_4];
										$$renderer3.option({ value: langCode }, ($$renderer4) => {
											$$renderer4.push(`${escape_html(displayLanguage(langCode))} (${escape_html(langCode)})`);
										});
									}
									$$renderer3.push(`<!--]-->`);
								} else {
									$$renderer3.push('<!--[!-->');
									$$renderer3.option({ value: 'en' }, ($$renderer4) => {
										$$renderer4.push(`English (en)`);
									});
								}
								$$renderer3.push(`<!--]-->`);
							}
						);
						$$renderer2.push(` `);
						if (errors[baseLocaleField.key]) {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(`<div class="mt-1 text-xs text-error-500">${escape_html(errors[baseLocaleField.key])}</div>`);
						} else {
							$$renderer2.push('<!--[!-->');
						}
						$$renderer2.push(`<!--]--></div>`);
					} else {
						$$renderer2.push('<!--[!-->');
					}
					$$renderer2.push(`<!--]--> `);
					if (localesField) {
						$$renderer2.push('<!--[-->');
						$$renderer2.push(
							`<div><div class="mb-1 flex items-center gap-1 text-sm font-medium tracking-wide"><iconify-icon icon="mdi:translate-variant" width="14" class="text-tertiary-500 dark:text-primary-500"></iconify-icon> <span>${escape_html(localesField.label)}</span> `
						);
						if (localesField.required) {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(`<span class="text-error-500">*</span>`);
						} else {
							$$renderer2.push('<!--[!-->');
						}
						$$renderer2.push(
							`<!--]--> <button type="button" class="ml-1 text-slate-400 hover:text-primary-500"${attr('data-tooltip', localesField.description)} aria-label="Field information"><iconify-icon icon="mdi:help-circle-outline" width="14"></iconify-icon></button></div> <div class="relative"><div${attr_class(`flex min-h-10 flex-wrap gap-2 rounded border p-2 pr-16 ${stringify(errors[localesField.key] ? 'border-error-500 bg-error-50 dark:bg-error-900/20' : 'border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700/40')}`)}>`
						);
						if (values[localesField.key]?.length > 0) {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(`<!--[-->`);
							const each_array_6 = ensure_array_like(values[localesField.key]);
							for (let $$index_5 = 0, $$length2 = each_array_6.length; $$index_5 < $$length2; $$index_5++) {
								let langCode = each_array_6[$$index_5];
								$$renderer2.push(
									`<span class="group preset-ghost-tertiary-500 badge inline-flex items-center gap-1 rounded-full dark:preset-ghost-primary-500">${escape_html(displayLanguage(langCode))} (${escape_html(langCode)}) `
								);
								if (!localesField.readonly) {
									$$renderer2.push('<!--[-->');
									$$renderer2.push(
										`<button type="button" class="opacity-60 transition hover:opacity-100"${attr('aria-label', `Remove ${stringify(langCode)}`)}>×</button>`
									);
								} else {
									$$renderer2.push('<!--[!-->');
								}
								$$renderer2.push(`<!--]--></span>`);
							}
							$$renderer2.push(`<!--]-->`);
						} else {
							$$renderer2.push('<!--[!-->');
							if (localesField.placeholder) {
								$$renderer2.push('<!--[-->');
								$$renderer2.push(`<span class="text-surface-500 dark:text-surface-50 text-xs">${escape_html(localesField.placeholder)}</span>`);
							} else {
								$$renderer2.push('<!--[!-->');
							}
							$$renderer2.push(`<!--]-->`);
						}
						$$renderer2.push(`<!--]--> `);
						if (!localesField.readonly) {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(
								`<button type="button" class="preset-filled-surface-500 badge absolute right-2 top-2 rounded-full" aria-haspopup="dialog"${attr('aria-expanded', showLanguagePicker[localesField.key])}${attr('aria-controls', `${stringify(localesField.key)}-lang-picker`)}><iconify-icon icon="mdi:plus" width="14"></iconify-icon> Add</button>`
							);
						} else {
							$$renderer2.push('<!--[!-->');
						}
						$$renderer2.push(`<!--]--></div> `);
						if (showLanguagePicker[localesField.key]) {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(
								`<div${attr('id', `${stringify(localesField.key)}-lang-picker`)} class="absolute left-0 top-full z-20 mt-2 w-64 rounded-md border border-slate-300/60 bg-surface-50 p-2 shadow-lg dark:border-slate-600 dark:bg-surface-800" role="dialog" aria-label="Add language" tabindex="-1"><input class="mb-2 w-full rounded border border-slate-300/60 bg-transparent px-2 py-1 text-xs outline-none focus:border-primary-500 dark:border-slate-600" placeholder="Search..."${attr('value', languageSearch[localesField.key])}/> <div class="max-h-48 overflow-auto">`
							);
							const each_array_7 = ensure_array_like(
								allowedLocales.filter((code) => {
									const search = (languageSearch[localesField.key] || '').toLowerCase();
									const currentValues = values[localesField.key] || [];
									const langName = displayLanguage(code).toLowerCase();
									return !currentValues.includes(code) && (search === '' || langName.includes(search) || code.toLowerCase().includes(search));
								})
							);
							if (each_array_7.length !== 0) {
								$$renderer2.push('<!--[-->');
								for (let $$index_6 = 0, $$length2 = each_array_7.length; $$index_6 < $$length2; $$index_6++) {
									let code = each_array_7[$$index_6];
									$$renderer2.push(
										`<button type="button" class="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-primary-500/10"><span>${escape_html(displayLanguage(code))} (${escape_html(code.toUpperCase())})</span> <iconify-icon icon="mdi:plus-circle-outline" width="14" class="text-primary-500"></iconify-icon></button>`
									);
								}
							} else {
								$$renderer2.push('<!--[!-->');
								$$renderer2.push(`<p class="px-1 py-2 text-center text-[11px] text-slate-500">No matches</p>`);
							}
							$$renderer2.push(`<!--]--></div></div>`);
						} else {
							$$renderer2.push('<!--[!-->');
						}
						$$renderer2.push(`<!--]--></div> `);
						if (errors[localesField.key]) {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(`<div class="mt-1 text-xs text-error-500">${escape_html(errors[localesField.key])}</div>`);
						} else {
							$$renderer2.push('<!--[!-->');
						}
						$$renderer2.push(`<!--]--> `);
						if (localesField.placeholder) {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(
								`<p class="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Example: ${escape_html(localesField.placeholder)}</p>`
							);
						} else {
							$$renderer2.push('<!--[!-->');
						}
						$$renderer2.push(`<!--]--></div>`);
					} else {
						$$renderer2.push('<!--[!-->');
					}
					$$renderer2.push(`<!--]--></div>`);
				}
				$$renderer2.push(`<!--]--></div>`);
			} else {
				$$renderer2.push('<!--[!-->');
				$$renderer2.push(`<div class="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2"><!--[-->`);
				const each_array_8 = ensure_array_like(group.fields);
				for (let $$index_13 = 0, $$length = each_array_8.length; $$index_13 < $$length; $$index_13++) {
					let field = each_array_8[$$index_13];
					$$renderer2.push(
						`<div${attr_class(`space-y-2 overflow-visible max-w-full ${stringify(field.type === 'array' || field.type === 'password' || field.type === 'language-multi' || field.type === 'loglevel-multi' ? 'lg:col-span-2' : '')}`)}><label${attr('for', field.key)} class="mb-2 block"><span class="flex items-center gap-2"><iconify-icon${attr('icon', getFieldIcon(field))} width="18" class="text-tertiary-500 dark:text-primary-500"></iconify-icon> <span class="text-sm font-semibold text-tertiary-500 dark:text-primary-500 md:text-base">${escape_html(field.label)}</span> `
					);
					if (field.required) {
						$$renderer2.push('<!--[-->');
						$$renderer2.push(`<span class="text-error-500">*</span>`);
					} else {
						$$renderer2.push('<!--[!-->');
					}
					$$renderer2.push(
						`<!--]--> <div class="group relative inline-block"><button type="button" class="text-surface-500 hover:text-surface-900 dark:text-surface-50 dark:hover:text-surface-50 cursor-help" aria-label="Field information"><iconify-icon icon="material-symbols:info-outline" width="16"></iconify-icon></button> <div class="pointer-events-none absolute bottom-full left-1/2 z-1000 mb-2 w-max max-w-[200px] -translate-x-1/2 rounded-md bg-black/90 px-3 py-2 text-xs leading-tight text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100 md:max-w-[250px]">${escape_html(field.description)}</div></div></span></label> `
					);
					if (field.type === 'text') {
						$$renderer2.push('<!--[-->');
						$$renderer2.push(
							`<input${attr('id', field.key)}${attr('type', field.key.toLowerCase().includes('email') || field.key === 'SMTP_USER' || field.label.toLowerCase().includes('email') ? 'email' : 'text')} class="input w-full max-w-full min-h-[44px]"${attr('value', values[field.key])}${attr('placeholder', field.placeholder)}${attr('required', field.required, true)}${attr('disabled', field.readonly, true)}/>`
						);
					} else {
						$$renderer2.push('<!--[!-->');
						if (field.type === 'number') {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(
								`<div class="input-group input-group-divider grid-cols-[1fr_auto] flex flex-col sm:flex-row max-w-full text-center sm:text-left"><input${attr('id', field.key)} type="number" class="input w-full max-w-full min-h-[44px]"${attr('value', values[field.key])}${attr('placeholder', field.placeholder)}${attr('required', field.required, true)}${attr('min', field.min)}${attr('max', field.max)}/> `
							);
							if (field.unit) {
								$$renderer2.push('<!--[-->');
								$$renderer2.push(`<div class="input-group-shim text-sm">${escape_html(field.unit)} `);
								if (typeof values[field.key] === 'number' && field.unit === 'seconds') {
									$$renderer2.push('<!--[-->');
									$$renderer2.push(
										`<span class="ml-2 text-surface-500 dark:text-surface-50">(${escape_html(formatDuration(values[field.key]))})</span>`
									);
								} else {
									$$renderer2.push('<!--[!-->');
								}
								$$renderer2.push(`<!--]--></div>`);
							} else {
								$$renderer2.push('<!--[!-->');
							}
							$$renderer2.push(`<!--]--></div>`);
						} else {
							$$renderer2.push('<!--[!-->');
							if (field.type === 'password') {
								$$renderer2.push('<!--[-->');
								$$renderer2.push(
									`<div class="relative"><input${attr('id', field.key)}${attr('type', showPassword[field.key] ? 'text' : 'password')} class="input w-full max-w-full min-h-[44px] pr-10"${attr('value', values[field.key])}${attr('placeholder', field.placeholder)}${attr('required', field.required, true)}${attr('disabled', field.readonly, true)} autocomplete="current-password"/> `
								);
								if (!field.readonly) {
									$$renderer2.push('<!--[-->');
									$$renderer2.push(
										`<button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 text-surface-600 hover:text-surface-900 dark:text-surface-300 dark:hover:text-surface-50"${attr('aria-label', showPassword[field.key] ? 'Hide password' : 'Show password')}><iconify-icon${attr('icon', showPassword[field.key] ? 'bi:eye-slash-fill' : 'bi:eye-fill')} width="20"></iconify-icon></button>`
									);
								} else {
									$$renderer2.push('<!--[!-->');
								}
								$$renderer2.push(`<!--]--></div>`);
							} else {
								$$renderer2.push('<!--[!-->');
								if (field.type === 'boolean') {
									$$renderer2.push('<!--[-->');
									$$renderer2.push(
										`<label class="flex items-center space-x-2"><input${attr('id', field.key)} type="checkbox" class="checkbox w-auto min-w-[20px] min-h-[20px]"${attr('checked', !!values[field.key], true)}/> <span>Enable ${escape_html(field.label)}</span></label>`
									);
								} else {
									$$renderer2.push('<!--[!-->');
									if (field.type === 'select' && field.options) {
										$$renderer2.push('<!--[-->');
										$$renderer2.select(
											{
												id: field.key,
												class: 'select w-full max-w-full min-h-[44px]',
												value: values[field.key],
												required: field.required,
												onchange: () => (errors[field.key] = '')
											},
											($$renderer3) => {
												$$renderer3.option({ value: '' }, ($$renderer4) => {
													$$renderer4.push(`Select ${escape_html(field.label)}...`);
												});
												$$renderer3.push(`<!--[-->`);
												const each_array_9 = ensure_array_like(field.options);
												for (let $$index_8 = 0, $$length2 = each_array_9.length; $$index_8 < $$length2; $$index_8++) {
													let option = each_array_9[$$index_8];
													$$renderer3.option({ value: option.value }, ($$renderer4) => {
														$$renderer4.push(`${escape_html(option.label)}`);
													});
												}
												$$renderer3.push(`<!--]-->`);
											}
										);
									} else {
										$$renderer2.push('<!--[!-->');
										if (field.type === 'array') {
											$$renderer2.push('<!--[-->');
											$$renderer2.push(
												`<input${attr('id', field.key)} type="text" class="input w-full max-w-full min-h-[44px]"${attr('value', getArrayValue(field.key))}${attr('placeholder', field.placeholder)}${attr('required', field.required, true)}/> <p class="mt-1 text-xs text-surface-500 dark:text-surface-50">Enter values separated by commas</p>`
											);
										} else {
											$$renderer2.push('<!--[!-->');
											if (field.type === 'language-multi') {
												$$renderer2.push('<!--[-->');
												$$renderer2.push(
													`<div class="relative"><div${attr_class(`flex min-h-10 flex-wrap gap-2 rounded border p-2 pr-16 ${stringify(errors[field.key] ? 'border-error-500 bg-error-50 dark:bg-error-900/20' : 'border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700/40')}`)}>`
												);
												if (values[field.key]?.length > 0) {
													$$renderer2.push('<!--[-->');
													$$renderer2.push(`<!--[-->`);
													const each_array_10 = ensure_array_like(values[field.key]);
													for (let $$index_9 = 0, $$length2 = each_array_10.length; $$index_9 < $$length2; $$index_9++) {
														let langCode = each_array_10[$$index_9];
														$$renderer2.push(
															`<span class="group preset-ghost-tertiary-500 badge inline-flex items-center gap-1 rounded-full dark:preset-ghost-primary-500">${escape_html(displayLanguage(langCode))} (${escape_html(langCode)}) `
														);
														if (!field.readonly) {
															$$renderer2.push('<!--[-->');
															$$renderer2.push(
																`<button type="button" class="opacity-60 transition hover:opacity-100"${attr('aria-label', `Remove ${stringify(langCode)}`)}>×</button>`
															);
														} else {
															$$renderer2.push('<!--[!-->');
														}
														$$renderer2.push(`<!--]--></span>`);
													}
													$$renderer2.push(`<!--]-->`);
												} else {
													$$renderer2.push('<!--[!-->');
													if (field.placeholder) {
														$$renderer2.push('<!--[-->');
														$$renderer2.push(`<span class="text-surface-500 dark:text-surface-50 text-xs">${escape_html(field.placeholder)}</span>`);
													} else {
														$$renderer2.push('<!--[!-->');
													}
													$$renderer2.push(`<!--]-->`);
												}
												$$renderer2.push(`<!--]--> `);
												if (!field.readonly) {
													$$renderer2.push('<!--[-->');
													$$renderer2.push(
														`<button type="button" class="preset-filled-surface-500 badge absolute right-2 top-2 rounded-full" aria-haspopup="dialog"${attr('aria-expanded', showLanguagePicker[field.key])}${attr('aria-controls', `${stringify(field.key)}-lang-picker`)}><iconify-icon icon="mdi:plus" width="14"></iconify-icon> Add</button>`
													);
												} else {
													$$renderer2.push('<!--[!-->');
												}
												$$renderer2.push(`<!--]--></div> `);
												if (showLanguagePicker[field.key]) {
													$$renderer2.push('<!--[-->');
													$$renderer2.push(
														`<div${attr('id', `${stringify(field.key)}-lang-picker`)} class="absolute left-0 top-full z-20 mt-2 w-64 rounded-md border border-slate-300/60 bg-surface-50 p-2 shadow-lg dark:border-slate-600 dark:bg-surface-800" role="dialog" aria-label="Add language" tabindex="-1"><input class="mb-2 w-full rounded border border-slate-300/60 bg-transparent px-2 py-1 text-xs outline-none focus:border-primary-500 dark:border-slate-600" placeholder="Search..."${attr('value', languageSearch[field.key])}/> <div class="max-h-48 overflow-auto">`
													);
													const each_array_11 = ensure_array_like(
														iso6391.filter((lang) => {
															const search = (languageSearch[field.key] || '').toLowerCase();
															const currentValues = values[field.key] || [];
															return (
																!currentValues.includes(lang.code) &&
																(search === '' ||
																	lang.name.toLowerCase().includes(search) ||
																	lang.native.toLowerCase().includes(search) ||
																	lang.code.toLowerCase().includes(search))
															);
														})
													);
													if (each_array_11.length !== 0) {
														$$renderer2.push('<!--[-->');
														for (let $$index_10 = 0, $$length2 = each_array_11.length; $$index_10 < $$length2; $$index_10++) {
															let lang = each_array_11[$$index_10];
															$$renderer2.push(
																`<button type="button" class="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-primary-500/10"><span>${escape_html(lang.native)} (${escape_html(lang.code)})</span> <iconify-icon icon="mdi:plus-circle-outline" width="14" class="text-primary-500"></iconify-icon></button>`
															);
														}
													} else {
														$$renderer2.push('<!--[!-->');
														$$renderer2.push(`<p class="px-1 py-2 text-center text-[11px] text-slate-500">No matches</p>`);
													}
													$$renderer2.push(`<!--]--></div></div>`);
												} else {
													$$renderer2.push('<!--[!-->');
												}
												$$renderer2.push(`<!--]--></div> `);
												if (field.placeholder && values[field.key]?.length > 0) {
													$$renderer2.push('<!--[-->');
													$$renderer2.push(
														`<p class="text-surface-500 dark:text-surface-50 mt-1 text-[10px]">Example: ${escape_html(field.placeholder)}</p>`
													);
												} else {
													$$renderer2.push('<!--[!-->');
												}
												$$renderer2.push(`<!--]-->`);
											} else {
												$$renderer2.push('<!--[!-->');
												if (field.type === 'loglevel-multi') {
													$$renderer2.push('<!--[-->');
													$$renderer2.push(
														`<div class="relative"><div${attr_class(`flex min-h-10 flex-wrap gap-2 rounded border p-2 pr-16 ${stringify(errors[field.key] ? 'border-error-500 bg-error-50 dark:bg-error-900/20' : 'border-slate-300/50 bg-surface-50 dark:border-slate-600 dark:bg-surface-700/40')}`)}>`
													);
													if (values[field.key]?.length > 0) {
														$$renderer2.push('<!--[-->');
														$$renderer2.push(`<!--[-->`);
														const each_array_12 = ensure_array_like(values[field.key]);
														for (let $$index_11 = 0, $$length2 = each_array_12.length; $$index_11 < $$length2; $$index_11++) {
															let level = each_array_12[$$index_11];
															$$renderer2.push(
																`<span class="group preset-ghost-tertiary-500 badge inline-flex items-center gap-1 rounded-full dark:preset-ghost-primary-500">${escape_html(level)} `
															);
															if (!field.readonly) {
																$$renderer2.push('<!--[-->');
																$$renderer2.push(
																	`<button type="button" class="opacity-60 transition hover:opacity-100"${attr('aria-label', `Remove ${stringify(level)}`)}>×</button>`
																);
															} else {
																$$renderer2.push('<!--[!-->');
															}
															$$renderer2.push(`<!--]--></span>`);
														}
														$$renderer2.push(`<!--]-->`);
													} else {
														$$renderer2.push('<!--[!-->');
														if (field.placeholder) {
															$$renderer2.push('<!--[-->');
															$$renderer2.push(
																`<span class="text-surface-500 dark:text-surface-50 text-xs">${escape_html(field.placeholder)}</span>`
															);
														} else {
															$$renderer2.push('<!--[!-->');
														}
														$$renderer2.push(`<!--]-->`);
													}
													$$renderer2.push(`<!--]--> `);
													if (!field.readonly) {
														$$renderer2.push('<!--[-->');
														$$renderer2.push(
															`<button type="button" class="preset-filled-surface-500 badge absolute right-2 top-2 rounded-full" aria-haspopup="dialog"${attr('aria-expanded', showLogLevelPicker[field.key])}${attr('aria-controls', `${stringify(field.key)}-loglevel-picker`)}><iconify-icon icon="mdi:plus" width="14"></iconify-icon> Add</button>`
														);
													} else {
														$$renderer2.push('<!--[!-->');
													}
													$$renderer2.push(`<!--]--></div> `);
													if (showLogLevelPicker[field.key]) {
														$$renderer2.push('<!--[-->');
														$$renderer2.push(
															`<div${attr('id', `${stringify(field.key)}-loglevel-picker`)} class="absolute left-0 top-full z-20 mt-2 w-64 rounded-md border border-slate-300/60 bg-surface-50 p-2 shadow-lg dark:border-slate-600 dark:bg-surface-800" role="dialog" aria-label="Add log level" tabindex="-1"><div class="max-h-48 overflow-auto"><!--[-->`
														);
														const each_array_13 = ensure_array_like(LOG_LEVELS);
														for (let $$index_12 = 0, $$length2 = each_array_13.length; $$index_12 < $$length2; $$index_12++) {
															let level = each_array_13[$$index_12];
															const currentValues = values[field.key] || [];
															if (!currentValues.includes(level)) {
																$$renderer2.push('<!--[-->');
																$$renderer2.push(
																	`<button type="button" class="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs capitalize hover:bg-primary-500/10"><span>${escape_html(level)}</span> <iconify-icon icon="mdi:plus-circle-outline" width="14" class="text-primary-500"></iconify-icon></button>`
																);
															} else {
																$$renderer2.push('<!--[!-->');
															}
															$$renderer2.push(`<!--]-->`);
														}
														$$renderer2.push(`<!--]--></div></div>`);
													} else {
														$$renderer2.push('<!--[!-->');
													}
													$$renderer2.push(`<!--]--></div> `);
													if (field.placeholder && values[field.key]?.length > 0) {
														$$renderer2.push('<!--[-->');
														$$renderer2.push(
															`<p class="text-surface-500 dark:text-surface-50 mt-1 text-[10px]">Example: ${escape_html(field.placeholder)}</p>`
														);
													} else {
														$$renderer2.push('<!--[!-->');
													}
													$$renderer2.push(`<!--]-->`);
												} else {
													$$renderer2.push('<!--[!-->');
												}
												$$renderer2.push(`<!--]-->`);
											}
											$$renderer2.push(`<!--]-->`);
										}
										$$renderer2.push(`<!--]-->`);
									}
									$$renderer2.push(`<!--]-->`);
								}
								$$renderer2.push(`<!--]-->`);
							}
							$$renderer2.push(`<!--]-->`);
						}
						$$renderer2.push(`<!--]-->`);
					}
					$$renderer2.push(`<!--]--> `);
					if (errors[field.key]) {
						$$renderer2.push('<!--[-->');
						$$renderer2.push(`<p class="mt-1 text-sm text-error-500">${escape_html(errors[field.key])}</p>`);
					} else {
						$$renderer2.push('<!--[!-->');
					}
					$$renderer2.push(`<!--]--></div>`);
				}
				$$renderer2.push(`<!--]--></div>`);
			}
			$$renderer2.push(
				`<!--]--> <div class="flex flex-col justify-between gap-2 pt-4 sm:flex-row max-w-full overflow-visible"><button type="button" class="preset-filled-surface-500 btn w-full sm:w-auto min-w-fit px-4 sm:min-h-[48px]"${attr('disabled', saving, true)}><span>🔄</span> <span>Reset to Defaults</span></button> <button type="submit" class="preset-filled-primary-500 btn w-full sm:w-auto min-w-fit px-4 sm:min-h-[48px]"${attr('disabled', saving, true)}>`
			);
			{
				$$renderer2.push('<!--[!-->');
				$$renderer2.push(`<span>💾</span> <span>Save Changes</span>`);
			}
			$$renderer2.push(`<!--]--></button></div></form>`);
		}
		$$renderer2.push(`<!--]--></div>`);
	});
}
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		var $$store_subs;
		const { data } = $$props;
		data.isAdmin;
		let availableGroups = [];
		const selectedGroupId = page.url.searchParams.get('group');
		let unconfiguredCount = 0;
		groupsNeedingConfig.subscribe((groups) => {
			unconfiguredCount = groups.size;
		});
		PageTitle($$renderer2, {
			name: 'Dynamic System Settings',
			icon: 'mdi:cog',
			showBackButton: true,
			backUrl: '/config'
		});
		$$renderer2.push(`<!----> <p class="mb-6 px-2 text-surface-600 dark:text-surface-300">These are critical system settings loaded dynamically from the database. Most changes take effect immediately, though settings marked with "Restart
	Required" need a server restart. Settings are organized into <span class="font-bold text-primary-500">${escape_html(availableGroups.length)}</span> logical groups for easy management.</p> `);
		if (unconfiguredCount > 0) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<div class="wrapper preset-filled-error-500 mb-6"><div class="text-sm opacity-90"><strong>⚠️ Action Required: ${escape_html(unconfiguredCount)}
				${escape_html(unconfiguredCount === 1 ? 'group needs' : 'groups need')} configuration before production use.</strong> <p class="mt-2">Please configure the following ${escape_html(unconfiguredCount === 1 ? 'group' : 'groups')}: <!--[-->`);
			const each_array = ensure_array_like(
				availableGroups.filter((g) => store_get(($$store_subs ??= {}), '$groupsNeedingConfig', groupsNeedingConfig).has(g.id))
			);
			for (let i = 0, $$length = each_array.length; i < $$length; i++) {
				let group = each_array[i];
				$$renderer2.push(`<span class="font-semibold">${escape_html(group.icon)}
						${escape_html(group.name)}${escape_html(i < unconfiguredCount - 1 ? ', ' : '')}</span>`);
			}
			$$renderer2.push(`<!--]--></p></div></div>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> <div class="card overflow-hidden min-h-[500px] max-h-[calc(100vh-140px)] flex flex-col">`);
		if (selectedGroupId) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<!---->`);
			{
				const group = availableGroups.find((g) => g.id === selectedGroupId);
				if (group) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(`<div class="h-full overflow-y-auto p-6">`);
					GenericSettingsGroup($$renderer2, { group });
					$$renderer2.push(`<!----></div>`);
				} else {
					$$renderer2.push('<!--[!-->');
					$$renderer2.push(
						`<div class="flex h-full items-center justify-center p-6 text-center"><p class="text-surface-500">Selected group not found.</p></div>`
					);
				}
				$$renderer2.push(`<!--]-->`);
			}
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(
				`<div class="flex h-full items-center justify-center p-6 text-center"><p class="text-surface-500">Select a group to configure.</p></div>`
			);
		}
		$$renderer2.push(
			`<!--]--></div> <div class="mx-auto mt-8 flex max-w-4xl items-center justify-center"><div class="badge-glass flex items-center gap-3 rounded-full px-6 py-3 text-sm"><span class="text-2xl text-tertiary-500 dark:text-primary-500">●</span> <span class="font-semibold text-tertiary-500 dark:text-primary-500">System Operational</span> <span class="text-dark dark:text-white">|</span> <span class="text-surface-600 dark:text-surface-300">Settings:</span> <span class="font-semibold text-tertiary-500 dark:text-primary-500">Loaded</span> <span class="text-dark dark:text-white">|</span> <span class="text-surface-600 dark:text-surface-300">Groups:</span> <span class="font-semibold text-tertiary-500 dark:text-primary-500">${escape_html(availableGroups.length)}</span> <span class="text-dark dark:text-white">|</span> <span class="text-surface-600 dark:text-surface-300">Environment:</span> <span class="font-semibold text-tertiary-500 dark:text-primary-500">Dynamic</span></div></div> \`\`\``
		);
		if ($$store_subs) unsubscribe_stores($$store_subs);
	});
}
export { _page as default };
//# sourceMappingURL=_page.svelte.js.map
