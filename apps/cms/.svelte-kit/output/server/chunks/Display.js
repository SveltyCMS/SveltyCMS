import { g as attr_class, c as stringify } from './index5.js';
function Display($$renderer, $$props) {
	const { value, size = 'md' } = $$props;
	const sizeClasses = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-6 h-6' };
	const sizeClass = sizeClasses[size];
	$$renderer.push(`<div class="flex h-full w-full items-center justify-center">`);
	if (value) {
		$$renderer.push('<!--[-->');
		$$renderer.push(
			`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"${attr_class(`text-success-500 ${stringify(sizeClass)}`)} aria-label="Checked" role="img"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19L21 7l-1.41-1.41z"></path></svg>`
		);
	} else {
		$$renderer.push('<!--[!-->');
		$$renderer.push(`<span class="select-none text-lg text-surface-400 dark:text-surface-500" aria-label="Unchecked" role="img">−</span>`);
	}
	$$renderer.push(`<!--]--></div>`);
}
export { Display as default };
//# sourceMappingURL=Display.js.map
