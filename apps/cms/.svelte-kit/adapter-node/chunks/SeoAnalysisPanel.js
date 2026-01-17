import { g as attr_class, c as stringify, d as escape_html, a as attr, e as ensure_array_like, i as clsx, h as bind_props } from './index5.js';
function SeoAnalysisPanel($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { analysisResult, class: className = '', expanded = false, isAnalyzing = false } = $$props;
		$$renderer2.push(
			`<div${attr_class(`card preset-tonal-surface flex flex-col overflow-hidden ${stringify(className)} transition-all duration-300 ${stringify(expanded ? 'h-[500px]' : 'h-16')}`, 'svelte-h69ce9')}><button type="button" class="flex items-center gap-4 w-full p-3 bg-surface-100-800-token hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors text-left"><div class="flex items-center gap-2 flex-1"><iconify-icon icon="mdi:google-analytics" class="text-tertiary-500 text-xl"></iconify-icon> <h3 class="h3 text-lg!">Analysis</h3></div> `
		);
		if (analysisResult) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="flex items-center gap-3"><div${attr_class(`font-bold text-lg ${stringify(analysisResult.score.overall >= 80 ? 'text-success-500' : analysisResult.score.overall >= 50 ? 'text-warning-500' : 'text-error-500')}`)}>${escape_html(isNaN(analysisResult.score.overall) ? '0' : analysisResult.score.overall)}%</div> <div class="text-xs opacity-70 hidden sm:block">`
			);
			if (analysisResult.score.overall >= 80) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`Excellent`);
			} else {
				$$renderer2.push('<!--[!-->');
				if (analysisResult.score.overall >= 50) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(`Good Start`);
				} else {
					$$renderer2.push('<!--[!-->');
					$$renderer2.push(`Needs Work`);
				}
				$$renderer2.push(`<!--]-->`);
			}
			$$renderer2.push(
				`<!--]--></div> <iconify-icon${attr('icon', expanded ? 'mdi:chevron-up' : 'mdi:chevron-down')} class="text-surface-400"></iconify-icon></div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<div class="text-xs opacity-50">`);
			if (isAnalyzing) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`Analyzing...`);
			} else {
				$$renderer2.push('<!--[!-->');
				$$renderer2.push(`No data`);
			}
			$$renderer2.push(`<!--]--></div>`);
		}
		$$renderer2.push(`<!--]--></button> `);
		if (expanded) {
			$$renderer2.push('<!--[-->');
			if (isAnalyzing) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<div class="flex-1 flex flex-col items-center justify-center text-surface-400 opacity-50 p-4"><div class="placeholder-circle animate-pulse w-8 h-8 mb-2"></div> <span class="text-xs">Analyzing...</span></div>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
				if (analysisResult) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(`<div class="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar border-t border-surface-500/20 svelte-h69ce9">`);
					if (analysisResult.suggestions.length > 0) {
						$$renderer2.push('<!--[-->');
						$$renderer2.push(`<!--[-->`);
						const each_array = ensure_array_like(analysisResult.suggestions);
						for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
							let suggestion = each_array[$$index];
							$$renderer2.push(
								`<div${attr_class(`card p-3 border-l-4 ${stringify(suggestion.type === 'error' ? 'border-error-500 bg-error-500/10' : suggestion.type === 'warning' ? 'border-warning-500 bg-warning-500/10' : 'border-primary-500 bg-primary-500/10')}`)}><div class="flex items-start gap-2"><div class="mt-0.5 shrink-0"><iconify-icon${attr('icon', suggestion.type === 'error' ? 'mdi:alert-circle' : suggestion.type === 'warning' ? 'mdi:alert' : 'mdi:information')}${attr_class(clsx(suggestion.type === 'error' ? 'text-error-500' : suggestion.type === 'warning' ? 'text-warning-500' : 'text-primary-500'))}></iconify-icon></div> <div class="flex-1 min-w-0"><div class="font-bold text-sm truncate"${attr('title', suggestion.title)}>${escape_html(suggestion.title)}</div> <p class="text-xs opacity-80 line-clamp-2"${attr('title', suggestion.description)}>${escape_html(suggestion.description)}</p> `
							);
							if (suggestion.fix) {
								$$renderer2.push('<!--[-->');
								$$renderer2.push(
									`<div class="mt-1.5 text-[10px] font-mono bg-surface-100 dark:bg-surface-700 p-1.5 rounded opacity-80"><strong>Fix:</strong> ${escape_html(suggestion.fix)}</div>`
								);
							} else {
								$$renderer2.push('<!--[!-->');
							}
							$$renderer2.push(`<!--]--></div></div></div>`);
						}
						$$renderer2.push(`<!--]-->`);
					} else {
						$$renderer2.push('<!--[!-->');
						$$renderer2.push(
							`<div class="alert variant-soft-success"><iconify-icon icon="mdi:check-circle" class="text-xl"></iconify-icon> <span class="text-sm">No issues found!</span></div>`
						);
					}
					$$renderer2.push(`<!--]--></div>`);
				} else {
					$$renderer2.push('<!--[!-->');
					$$renderer2.push(
						`<div class="flex-1 flex flex-col items-center justify-center text-surface-400 opacity-50 p-4"><span class="text-xs">Run analysis to see results.</span></div>`
					);
				}
				$$renderer2.push(`<!--]-->`);
			}
			$$renderer2.push(`<!--]-->`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div>`);
		bind_props($$props, { expanded });
	});
}
export { SeoAnalysisPanel as default };
//# sourceMappingURL=SeoAnalysisPanel.js.map
