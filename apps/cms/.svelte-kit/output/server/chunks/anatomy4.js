import { f as attributes, p as props_id } from './index5.js';
import { c as createContext, m as mergeProps, u as useMachine, n as normalizeProps } from './machine.svelte.js';
import { splitItemGroupLabelProps, splitItemGroupProps, splitItemProps, splitOptionItemProps, machine, connect, splitProps } from '@zag-js/menu';
import 'clsx';
const RootContext = createContext();
function Arrow_tip($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const menu = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(menu().getArrowTipProps(), rest);
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
function Arrow($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const menu = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(menu().getArrowProps(), rest);
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
function Content($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const menu = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(menu().getContentProps(), rest);
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
function Context_trigger($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const menu = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(menu().getContextTriggerProps(), rest);
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
function Indicator($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const menu = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(menu().getIndicatorProps(), rest);
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
const ItemGroupContext = createContext();
function Item_group_label($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const menu = RootContext.consume();
		const itemGroupProps = ItemGroupContext.consume();
		const [labelProps, componentProps] = splitItemGroupLabelProps({ htmlFor: itemGroupProps().id, ...props });
		const { element, children, ...rest } = componentProps;
		const attributes$1 = mergeProps(menu().getItemGroupLabelProps(labelProps), rest);
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
function Item_group($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const id = props_id($$renderer2);
		const { $$slots, $$events, ...props } = $$props;
		const menu = RootContext.consume();
		const [itemGroupProps, componentProps] = splitItemGroupProps({ id, ...props });
		const { element, children, ...rest } = componentProps;
		const attributes$1 = mergeProps(menu().getItemGroupProps(itemGroupProps), rest);
		ItemGroupContext.provide(() => itemGroupProps);
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
const ItemContext = createContext();
function Item_indicator($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const menu = RootContext.consume();
		const itemProps = ItemContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(menu().getItemIndicatorProps(itemProps()), rest);
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
function Item_text($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const menu = RootContext.consume();
		const itemProps = ItemContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(menu().getItemTextProps(itemProps()), rest);
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
function Item($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const menu = RootContext.consume();
		const [itemProps, componentProps] = splitItemProps(props);
		const { element, children, ...rest } = componentProps;
		const attributes$1 = mergeProps(menu().getItemProps(itemProps), rest);
		ItemContext.provide(() => itemProps);
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
function Option_item($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const menu = RootContext.consume();
		const [itemProps, componentProps] = splitOptionItemProps(props);
		const { element, children, ...rest } = componentProps;
		const attributes$1 = mergeProps(menu().getOptionItemProps(itemProps), rest);
		ItemContext.provide(() => itemProps);
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
function Positioner($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const menu = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(menu().getPositionerProps(), rest);
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
		const menu = RootContext.consume();
		const { children } = props;
		children($$renderer2, menu);
		$$renderer2.push(`<!---->`);
	});
}
const TriggerItemContext = createContext();
function Root_provider($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const parentMenu = RootContext.consume();
		const { children, value: menu } = props;
		RootContext.provide(() => menu());
		TriggerItemContext.provide(() => parentMenu?.().getTriggerItemProps(menu()));
		children?.($$renderer2);
		$$renderer2.push(`<!---->`);
	});
}
function useMenu(props) {
	const service = useMachine(machine, props);
	const menu = connect(service, normalizeProps);
	return () => ({
		...menu,
		get service() {
			return service;
		}
	});
}
function Root($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const id = props_id($$renderer2);
		const { $$slots, $$events, ...props } = $$props;
		const parentMenu = RootContext.consume();
		const [menuProps, componentProps] = splitProps(props);
		const { children } = componentProps;
		const menu = useMenu(() => ({ ...menuProps, id }));
		RootContext.provide(() => menu());
		TriggerItemContext.provide(() => parentMenu?.().getTriggerItemProps(menu()));
		children?.($$renderer2);
		$$renderer2.push(`<!---->`);
	});
}
function Separator($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const menu = RootContext.consume();
		const { element, ...rest } = props;
		const attributes$1 = mergeProps(menu().getSeparatorProps(), rest);
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<hr${attributes({ ...attributes$1 })}/>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function Trigger_item($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const triggerItemProps = TriggerItemContext.consume();
		const [itemProps, componentProps] = splitItemProps(props);
		const { element, children, ...rest } = componentProps;
		const attributes$1 = mergeProps(triggerItemProps(), rest);
		ItemContext.provide(() => itemProps);
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
		const menu = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(menu().getTriggerProps(), rest);
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
const Menu = Object.assign(Root, {
	Provider: Root_provider,
	Context: Root_context,
	Trigger,
	ContextTrigger: Context_trigger,
	Indicator,
	Positioner,
	Content,
	ItemGroup: Item_group,
	ItemGroupLabel: Item_group_label,
	Item,
	OptionItem: Option_item,
	TriggerItem: Trigger_item,
	ItemText: Item_text,
	ItemIndicator: Item_indicator,
	Separator,
	Arrow,
	ArrowTip: Arrow_tip
});
export { Menu as M };
//# sourceMappingURL=anatomy4.js.map
