import { f as attributes, p as props_id } from './index5.js';
import { c as createContext, m as mergeProps, u as useMachine, n as normalizeProps } from './machine.svelte.js';
import { splitContentProps, machine, connect, splitProps, splitTriggerProps } from '@zag-js/tabs';
import 'clsx';
const RootContext = createContext();
function Content($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const tabs = RootContext.consume();
		const [contentProps, componentProps] = splitContentProps(props);
		const { element, children, ...rest } = componentProps;
		const attributes$1 = mergeProps(tabs().getContentProps(contentProps), rest);
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<div${attributes({ ...attributes$1 })}>`);
			children?.($$renderer2);
			$$renderer2.push(`<!----></div>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function Indicator($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const tabs = RootContext.consume();
		const { element, ...rest } = props;
		const attributes$1 = mergeProps(tabs().getIndicatorProps(), rest);
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<div${attributes({ ...attributes$1 })}></div>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function List($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const tabs = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(tabs().getListProps(), rest);
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<div${attributes({ ...attributes$1 })}>`);
			children?.($$renderer2);
			$$renderer2.push(`<!----></div>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function Root_context($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const tabs = RootContext.consume();
		const { children } = props;
		children($$renderer2, tabs);
		$$renderer2.push(`<!---->`);
	});
}
function Root_provider($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const { element, children, value: tabs, ...rest } = props;
		const attributes$1 = mergeProps(tabs().getRootProps(), rest);
		RootContext.provide(() => tabs());
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<div${attributes({ ...attributes$1 })}>`);
			children?.($$renderer2);
			$$renderer2.push(`<!----></div>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function useTabs(props) {
	const service = useMachine(machine, props);
	const tabs = connect(service, normalizeProps);
	return () => tabs;
}
function Root($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const id = props_id($$renderer2);
		const { $$slots, $$events, ...props } = $$props;
		const [tabsProps, componentProps] = splitProps(props);
		const { element, children, ...rest } = componentProps;
		const tabs = useTabs(() => ({ ...tabsProps, id }));
		const attributes$1 = mergeProps(tabs().getRootProps(), rest);
		RootContext.provide(() => tabs());
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<div${attributes({ ...attributes$1 })}>`);
			children?.($$renderer2);
			$$renderer2.push(`<!----></div>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function Trigger($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const tabs = RootContext.consume();
		const [triggerProps, componentProps] = splitTriggerProps(props);
		const { element, children, ...rest } = componentProps;
		const attributes$1 = mergeProps(tabs().getTriggerProps(triggerProps), rest);
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<button${attributes({ ...attributes$1 })}>`);
			children?.($$renderer2);
			$$renderer2.push(`<!----></button>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
const Tabs = Object.assign(Root, {
	Provider: Root_provider,
	Context: Root_context,
	List,
	Trigger,
	Indicator,
	Content
});
export { Tabs as T };
//# sourceMappingURL=anatomy3.js.map
