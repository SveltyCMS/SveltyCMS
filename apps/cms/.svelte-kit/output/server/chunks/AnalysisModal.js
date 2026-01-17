import { g as attr_class, b as attr_style, d as escape_html, c as stringify, e as ensure_array_like, a as attr, h as bind_props } from './index5.js';
function AnalysisModal($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { show = void 0, analysisResult, onclose = () => {} } = $$props;
		if (show) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="fixed inset-0 z-999 bg-surface-backdrop-token backdrop-blur-sm" role="presentation"></div> <div class="fixed left-1/2 top-1/2 z-1000 -translate-x-1/2 -translate-y-1/2 shadow-xl" role="dialog" aria-modal="true"><div class="card w-[90vw] max-w-2xl max-h-[85vh] overflow-hidden flex flex-col bg-surface-100-800-token"><header class="card-header flex items-center justify-between border-b border-surface-500/20 p-4"><h3 class="h3 flex items-center gap-2"><iconify-icon icon="mdi:google-analytics" class="text-primary-500"></iconify-icon> SEO Analysis Report</h3> <button type="button" class="btn-icon btn-icon-sm preset-outlined-surface-500" aria-label="Close"><iconify-icon icon="mdi:close" width="24"></iconify-icon></button></header> <div class="flex-1 overflow-y-auto p-4 space-y-4">`
			);
			if (analysisResult) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<div class="flex items-center justify-center p-4 bg-surface-200-700-token rounded-container-token mb-6"><div class="text-center"><div${attr_class(`radial-progress text-4xl font-bold ${stringify(analysisResult.score.overall >= 80 ? 'text-success-500' : analysisResult.score.overall >= 50 ? 'text-warning-500' : 'text-error-500')}`)}${attr_style(`--value:${stringify(analysisResult.score.overall)}; --size:6rem;`)}>${escape_html(analysisResult.score.overall)}%</div> <p class="mt-2 font-bold text-surface-600 dark:text-surface-300">Overall Score</p></div> <div class="ml-8 grid grid-cols-2 gap-4 text-sm"><div class="flex flex-col"><span class="opacity-70">Keywords</span> <span${attr_class(`font-bold ${stringify(analysisResult.score.keywords >= 80 ? 'text-success-500' : 'text-warning-500')}`)}>${escape_html(analysisResult.score.keywords)}%</span></div> <div class="flex flex-col"><span class="opacity-70">Content</span> <span${attr_class(`font-bold ${stringify(analysisResult.score.content >= 80 ? 'text-success-500' : 'text-warning-500')}`)}>${escape_html(analysisResult.score.content)}%</span></div> <div class="flex flex-col"><span class="opacity-70">Technical</span> <span${attr_class(`font-bold ${stringify(analysisResult.score.technical >= 80 ? 'text-success-500' : 'text-warning-500')}`)}>${escape_html(analysisResult.score.technical)}%</span></div> <div class="flex flex-col"><span class="opacity-70">Readability</span> <span${attr_class(`font-bold ${stringify(analysisResult.score.readability >= 80 ? 'text-success-500' : 'text-warning-500')}`)}>${escape_html(analysisResult.score.readability)}%</span></div></div></div> `
				);
				if (analysisResult.suggestions.length > 0) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(`<div class="space-y-3"><h4 class="h4">Room for Improvement</h4> <!--[-->`);
					const each_array = ensure_array_like(analysisResult.suggestions);
					for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
						let suggestion = each_array[$$index];
						$$renderer2.push(
							`<div${attr_class(`card p-4 border-l-4 ${stringify(suggestion.type === 'error' ? 'border-error-500 bg-error-500/10' : suggestion.type === 'warning' ? 'border-warning-500 bg-warning-500/10' : 'border-primary-500 bg-primary-500/10')}`)}><div class="flex items-start justify-between"><div><div class="font-bold flex items-center gap-2"><iconify-icon${attr('icon', suggestion.type === 'error' ? 'mdi:alert-circle' : suggestion.type === 'warning' ? 'mdi:alert' : 'mdi:information')}></iconify-icon> ${escape_html(suggestion.title)}</div> <p class="text-sm mt-1 opacity-90">${escape_html(suggestion.description)}</p> `
						);
						if (suggestion.fix) {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(
								`<div class="mt-2 text-xs font-mono bg-surface-100 dark:bg-surface-600/50 p-2 rounded"><strong>Fix:</strong> ${escape_html(suggestion.fix)}</div>`
							);
						} else {
							$$renderer2.push('<!--[!-->');
						}
						$$renderer2.push(
							`<!--]--></div> <span${attr_class(`badge ${stringify(suggestion.type === 'error' ? 'preset-filled-error-500' : suggestion.type === 'warning' ? 'variant-filled-warning' : 'preset-filled-primary-500')} uppercase text-[10px]`)}>${escape_html(suggestion.type)}</span></div></div>`
						);
					}
					$$renderer2.push(`<!--]--></div>`);
				} else {
					$$renderer2.push('<!--[!-->');
					$$renderer2.push(
						`<div class="alert variant-soft-success"><iconify-icon icon="mdi:check-circle" class="text-2xl mr-2"></iconify-icon> <span>Great job! No specific issues found.</span></div>`
					);
				}
				$$renderer2.push(`<!--]-->`);
			} else {
				$$renderer2.push('<!--[!-->');
				$$renderer2.push(
					`<div class="p-8 text-center"><div class="placeholder-circle animate-pulse w-16 h-16 mx-auto mb-4"></div> <p>Running Analysis...</p></div>`
				);
			}
			$$renderer2.push(
				`<!--]--></div> <footer class="card-footer p-4 border-t border-surface-500/20 flex justify-end"><button class="btn preset-filled-surface-500">Close</button></footer></div></div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]-->`);
		bind_props($$props, { show });
	});
}
export { AnalysisModal as default };
//# sourceMappingURL=AnalysisModal.js.map
