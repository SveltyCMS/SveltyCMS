import { f as attributes, p as props_id } from './index5.js';
import { c as createContext, m as mergeProps, u as useMachine, n as normalizeProps } from './machine.svelte.js';
import { n as noop, u as untrack, f as render_effect, t as teardown, A as ATTACHMENT_KEY } from './utils2.js';
import 'clsx';
import { machine, connect, splitProps } from '@zag-js/tooltip';
function createAttachmentKey() {
	return Symbol(ATTACHMENT_KEY);
}
function fromAction(
	action,
	/** @type {() => T} */
	fn = noop
) {
	return (element) => {
		const { update, destroy } = untrack(() => action(element, fn()) ?? {});
		if (update) {
			var ran = false;
			render_effect(() => {
				const arg = fn();
				if (ran) update(arg);
			});
			ran = true;
		}
		if (destroy) {
			teardown(destroy);
		}
	};
}
function portal(node, props = {}) {
	function update(props2 = {}) {
		const { container, disabled, getRootNode } = props2;
		if (disabled) return;
		const doc = getRootNode?.().ownerDocument ?? document;
		const mountNode = container ?? doc.body;
		mountNode.appendChild(node);
	}
	update(props);
	return {
		destroy: () => node.remove(),
		update
	};
}
const RootContext = createContext();
function Arrow_tip($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const tooltip = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(tooltip().getArrowTipProps(), rest);
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
		const tooltip = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(tooltip().getArrowProps(), rest);
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
		const tooltip = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(tooltip().getContentProps(), rest);
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
		const tooltip = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(tooltip().getPositionerProps(), { [createAttachmentKey()]: fromAction(portal, () => void 0) }, rest);
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
		const tooltip = RootContext.consume();
		const { children } = props;
		children($$renderer2, tooltip);
		$$renderer2.push(`<!---->`);
	});
}
function useTooltip(props) {
	const service = useMachine(machine, props);
	const tooltip = connect(service, normalizeProps);
	return () => tooltip;
}
function Root_provider($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const { children, value: tooltip } = props;
		RootContext.provide(() => tooltip());
		children?.($$renderer2);
		$$renderer2.push(`<!---->`);
	});
}
function Root($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const id = props_id($$renderer2);
		const { $$slots, $$events, ...props } = $$props;
		const [tooltipProps, componentProps] = splitProps(props);
		const { children } = componentProps;
		const tooltip = useTooltip(() => ({ ...tooltipProps, id }));
		RootContext.provide(() => tooltip());
		children?.($$renderer2);
		$$renderer2.push(`<!---->`);
	});
}
function Trigger($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const tooltip = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(tooltip().getTriggerProps(), rest);
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
const Tooltip = Object.assign(Root, {
	Provider: Root_provider,
	Context: Root_context,
	Trigger,
	Positioner,
	Content,
	Arrow,
	ArrowTip: Arrow_tip
});
export { Tooltip as T };
//# sourceMappingURL=anatomy2.js.map
