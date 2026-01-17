import { d as escape_html } from './index5.js';
import 'clsx';
import './logger.js';
function MissingWidget($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { config, showDebugInfo = false } = $$props;
		const widgetName = config.widget?.Name || config.__missingWidgetName || 'Unknown';
		const fieldLabel = config.label || 'Unnamed Field';
		config.db_fieldName || 'unknown_field';
		$$renderer2.push(
			`<div class="missing-widget rounded-lg border-2 border-warning-400 bg-warning-50 p-4 dark:border-warning-600 dark:bg-warning-950 svelte-xg5zfl" role="alert" aria-live="polite"><div class="mb-2 flex items-start gap-3"><svg class="h-6 w-6 shrink-0 text-warning-600 dark:text-warning-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> <div class="flex-1"><h3 class="text-lg font-semibold text-warning-800 dark:text-warning-200">Missing Widget</h3> <p class="mt-1 text-sm text-warning-700 dark:text-warning-300">The widget <strong>"${escape_html(widgetName)}"</strong> is not available for the field <strong>"${escape_html(fieldLabel)}"</strong>.</p></div></div> `
		);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(
			`<!--]--> <div class="mt-4 space-y-2"><p class="text-sm font-semibold text-warning-800 dark:text-warning-200">Possible Solutions:</p> <ul class="ml-4 space-y-1 text-sm text-warning-700 dark:text-warning-300"><li class="flex items-start gap-2"><span class="mt-0.5">•</span> <span>Check if the widget is installed and activated in <a href="/config/widgetManagement" class="underline hover:text-warning-900 dark:hover:text-warning-100">Widget Management</a></span></li> <li class="flex items-start gap-2"><span class="mt-0.5">•</span> <span>Verify the widget name matches an available widget</span></li> <li class="flex items-start gap-2"><span class="mt-0.5">•</span> <span>Check the collection schema configuration for typos</span></li> `
		);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></ul></div> `);
		{
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="mt-4 rounded border border-error-300 bg-error-50 p-2 text-xs text-error-700 dark:border-error-700 dark:bg-error-950 dark:text-error-300"><strong>Note:</strong> This field will not be editable until the widget is available.</div>`
			);
		}
		$$renderer2.push(`<!--]--></div>`);
	});
}
export { MissingWidget as default };
//# sourceMappingURL=MissingWidget.js.map
