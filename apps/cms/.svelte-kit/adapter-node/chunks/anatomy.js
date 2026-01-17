import 'clsx';
import { k as getAllContexts } from './index5.js';
function Root($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		getAllContexts();
		const { children, disabled = false, target = typeof window === 'undefined' ? void 0 : document.body } = props;
		if (disabled || !target) {
			$$renderer2.push('<!--[-->');
			children($$renderer2);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]-->`);
	});
}
const Portal = Root;
export { Portal as P };
//# sourceMappingURL=anatomy.js.map
