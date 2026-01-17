import { h as bind_props, g as attr_class, c as stringify } from './index5.js';
import { a as app } from './store.svelte.js';
import { publicEnv } from './globalSettings.svelte.js';
import SeoAnalysisPanel from './SeoAnalysisPanel.js';
import SeoPreview from './SeoPreview.js';
import SeoField from './SeoField.js';
function Input($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { field, value = void 0, validationError: _validationError } = $$props;
		let analysisResults = null;
		let showAnalysis = false;
		let isAnalyzing = false;
		let availableLanguages = [];
		const currentLang = app.contentLanguage;
		let lang = currentLang || 'en';
		function hasFeature(feature) {
			return field.defaults?.features?.includes(feature) ?? true;
		}
		function getFieldTranslationPercentage(fieldName) {
			if (!value || availableLanguages.length === 0) return 0;
			const safeValue = value;
			const populatedCount = availableLanguages.filter((l) => {
				const langData = safeValue[l];
				if (!langData) return false;
				const fieldData = langData[fieldName];
				return typeof fieldData === 'string' && fieldData.trim() !== '';
			}).length;
			return Math.round((populatedCount / availableLanguages.length) * 100);
		}
		const updateField = (fieldName, newVal) => {
			if (!value || !value[lang]) return;
			value[lang][fieldName] = newVal;
		};
		const isTranslated = field.translated;
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer3) {
			$$renderer3.push(`<div class="space-y-4"><div class="grid grid-cols-1 lg:grid-cols-3 gap-6"><div class="lg:col-span-2 space-y-4">`);
			SeoPreview($$renderer3, {
				title: value?.[lang]?.title || '',
				description: value?.[lang]?.description || '',
				hostUrl: `${publicEnv.HOST_PROD}/${value?.[lang]?.canonicalUrl || ''}`,
				SeoPreviewToggle: false
			});
			$$renderer3.push(`<!----></div> <div class="lg:col-span-1">`);
			SeoAnalysisPanel($$renderer3, {
				analysisResult: analysisResults,
				isAnalyzing,
				get expanded() {
					return showAnalysis;
				},
				set expanded($$value) {
					showAnalysis = $$value;
					$$settled = false;
				}
			});
			$$renderer3.push(
				`<!----></div></div> <div class="card p-4 variant-glass-surface"><div class="flex border-b border-surface-400/30 mb-6"><button${attr_class(
					`px-4 py-2 border-b-2 transition-colors hover:bg-surface-100 dark:hover:bg-surface-700/50 ${stringify(
						'border-primary-500 font-bold text-primary-500'
					)}`
				)}>Basic</button> `
			);
			if (hasFeature('social')) {
				$$renderer3.push('<!--[-->');
				$$renderer3.push(
					`<button${attr_class(`px-4 py-2 border-b-2 transition-colors hover:bg-surface-100 dark:hover:bg-surface-700/50 ${stringify('border-transparent text-surface-600 dark:text-surface-50 hover:text-surface-900 dark:hover:text-surface-200')}`)}>Social</button>`
				);
			} else {
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(`<!--]--> `);
			if (hasFeature('advanced')) {
				$$renderer3.push('<!--[-->');
				$$renderer3.push(
					`<button${attr_class(`px-4 py-2 border-b-2 transition-colors hover:bg-surface-100 dark:hover:bg-surface-700/50 ${stringify('border-transparent text-surface-600 dark:text-surface-50 hover:text-surface-900 dark:hover:text-surface-200')}`)}>Advanced</button>`
				);
			} else {
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(`<!--]--></div> <div class="mt-4 space-y-4">`);
			if (value && value[lang]) {
				$$renderer3.push('<!--[-->');
				{
					$$renderer3.push('<!--[-->');
					SeoField($$renderer3, {
						id: 'seo-title',
						label: 'Title',
						value: value[lang].title,
						field,
						lang,
						translated: isTranslated,
						translationPct: getFieldTranslationPercentage('title'),
						onUpdate: (v) => updateField('title', v),
						maxLength: 60,
						optimalMin: 50,
						optimalMax: 60,
						placeholder: 'Page Title'
					});
					$$renderer3.push(`<!----> `);
					SeoField($$renderer3, {
						id: 'seo-description',
						label: 'Description',
						type: 'textarea',
						value: value[lang].description,
						field,
						lang,
						translated: isTranslated,
						translationPct: getFieldTranslationPercentage('description'),
						onUpdate: (v) => updateField('description', v),
						maxLength: 160,
						optimalMin: 150,
						optimalMax: 160,
						placeholder: 'Page Description'
					});
					$$renderer3.push(`<!----> `);
					SeoField($$renderer3, {
						id: 'seo-focusKeyword',
						label: 'Focus Keyword',
						value: value[lang].focusKeyword,
						field,
						lang,
						translated: isTranslated,
						translationPct: getFieldTranslationPercentage('focusKeyword'),
						onUpdate: (v) => updateField('focusKeyword', v),
						placeholder: 'Main keyword'
					});
					$$renderer3.push(`<!---->`);
				}
				$$renderer3.push(`<!--]-->`);
			} else {
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(`<!--]--></div></div></div>`);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer2.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer2.subsume($$inner_renderer);
		bind_props($$props, { value });
	});
}
export { Input as default };
//# sourceMappingURL=Input13.js.map
