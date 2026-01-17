import {
	f as attributes,
	p as props_id,
	g as attr_class,
	i as clsx,
	e as ensure_array_like,
	d as escape_html,
	h as bind_props,
	a as attr
} from './index5.js';
import { c as createContext, m as mergeProps, u as useMachine, n as normalizeProps } from './machine.svelte.js';
import { splitItemProps, machine, connect, splitProps } from '@zag-js/rating-group';
import 'clsx';
const RootContext = createContext();
function Control($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const ratingGroup = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(ratingGroup().getControlProps(), rest);
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
function Hidden_input($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const ratingGroup = RootContext.consume();
		const { element, ...rest } = props;
		const attributes$1 = mergeProps(ratingGroup().getHiddenInputProps(), rest);
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<input${attributes({ ...attributes$1 }, void 0, void 0, void 0, 4)}/>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function Star_empty($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const { ...rest } = props;
		const attributes$1 = mergeProps(
			{
				xmlns: 'http://www.w3.org/2000/svg',
				viewBox: '0 0 24 24',
				height: '24',
				width: '24',
				fill: 'none',
				stroke: 'currentColor',
				'stroke-width': '1.5'
			},
			rest
		);
		$$renderer2.push(`<svg${attributes({ ...attributes$1 }, void 0, void 0, void 0, 3)}><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345
       l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557
       l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0
       L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557
       l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345
       L11.48 3.5Z"></path></svg>`);
	});
}
function Star_full($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const { ...rest } = props;
		const attributes$1 = mergeProps(
			{
				xmlns: 'http://www.w3.org/2000/svg',
				viewBox: '0 0 24 24',
				height: '24',
				width: '24',
				fill: 'currentColor'
			},
			rest
		);
		$$renderer2.push(`<svg${attributes({ ...attributes$1 }, void 0, void 0, void 0, 3)}><path fill-rule="evenodd" clip-rule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 
       5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 
       1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 
       7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273 
       -4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 
       2.082-5.005Z"></path></svg>`);
	});
}
function Star_half($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const { ...rest } = props;
		const attributes$1 = mergeProps(
			{
				xmlns: 'http://www.w3.org/2000/svg',
				viewBox: '0 0 24 24',
				height: '24',
				width: '24',
				fill: 'none',
				stroke: 'currentColor',
				'stroke-width': '1.5'
			},
			rest
		);
		$$renderer2.push(`<svg${attributes({ ...attributes$1 }, void 0, void 0, void 0, 3)}><defs><linearGradient id="half-fill" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="50%" stop-color="currentColor"></stop><stop offset="50%" stop-color="transparent"></stop></linearGradient></defs><path fill="url(#half-fill)" stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345
       l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557
       l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0
       L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557
       l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345
       L11.48 3.5Z"></path></svg>`);
	});
}
function starEmpty($$renderer) {
	Star_empty($$renderer, {});
}
function starHalf($$renderer) {
	Star_half($$renderer, {});
}
function starFull($$renderer) {
	Star_full($$renderer, {});
}
function Item($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const ratingGroup = RootContext.consume();
		const [itemProps, componentProps] = splitItemProps(props);
		const { element, children, empty = starEmpty, half = starHalf, full = starFull, ...rest } = componentProps;
		const itemState = ratingGroup().getItemState(itemProps);
		const attributes$1 = mergeProps(ratingGroup().getItemProps(itemProps), rest);
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<div${attributes({ ...attributes$1 })}>`);
			if (children) {
				$$renderer2.push('<!--[-->');
				children($$renderer2);
				$$renderer2.push(`<!---->`);
			} else {
				$$renderer2.push('<!--[!-->');
				if (!itemState.highlighted) {
					$$renderer2.push('<!--[-->');
					empty?.($$renderer2);
					$$renderer2.push(`<!---->`);
				} else {
					$$renderer2.push('<!--[!-->');
					if (itemState.half) {
						$$renderer2.push('<!--[-->');
						half?.($$renderer2);
						$$renderer2.push(`<!---->`);
					} else {
						$$renderer2.push('<!--[!-->');
						full?.($$renderer2);
						$$renderer2.push(`<!---->`);
					}
					$$renderer2.push(`<!--]-->`);
				}
				$$renderer2.push(`<!--]-->`);
			}
			$$renderer2.push(`<!--]--></div>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function Label($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const ratingGroup = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(ratingGroup().getLabelProps(), rest);
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<label${attributes({ ...attributes$1 })}>`);
			children?.($$renderer2);
			$$renderer2.push(`<!----></label>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function Root_context($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const ratingGroup = RootContext.consume();
		const { children } = props;
		children($$renderer2, ratingGroup);
		$$renderer2.push(`<!---->`);
	});
}
function Root_provider($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const { element, children, value: ratingGroup, ...rest } = props;
		const attributes$1 = mergeProps(ratingGroup().getRootProps(), rest);
		RootContext.provide(() => ratingGroup());
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
function useRatingGroup(props) {
	const service = useMachine(machine, props);
	const ratingGroup = connect(service, normalizeProps);
	return () => ratingGroup;
}
function Root($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const id = props_id($$renderer2);
		const { $$slots, $$events, ...props } = $$props;
		const [ratingGroupProps, componentProps] = splitProps(props);
		const { element, children, ...rest } = componentProps;
		const ratingGroup = useRatingGroup(() => ({ ...ratingGroupProps, id }));
		const attributes$1 = mergeProps(ratingGroup().getRootProps(), rest);
		RootContext.provide(() => ratingGroup());
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
const RatingGroup = Object.assign(Root, {
	Provider: Root_provider,
	Context: Root_context,
	Label,
	Control,
	Item,
	HiddenInput: Hidden_input
});
function Input($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { field, value = void 0, error } = $$props;
		let ratingValue = value ?? 0;
		$$renderer2.push(
			`<div${attr_class('relative inline-block w-full rounded border p-2 border-surface-400 dark:border-surface-400', void 0, {
				'!border-error-500':
					// Sync ratingValue back to prop value
					!!error,
				invalid: !!error
			})}><div${attr_class(clsx(error ? ' text-error-500' : ''))}>`
		);
		RatingGroup($$renderer2, {
			value: ratingValue,
			onValueChange: (e) => (ratingValue = e.value),
			'aria-label': field.label,
			children: ($$renderer3) => {
				$$renderer3.push(`<!---->`);
				RatingGroup.Control($$renderer3, {
					children: ($$renderer4) => {
						$$renderer4.push(`<!--[-->`);
						const each_array = ensure_array_like({ length: Number(field.max) || 5 });
						for (let i = 0, $$length = each_array.length; i < $$length; i++) {
							each_array[i];
							$$renderer4.push(`<!---->`);
							{
								let empty = function ($$renderer5) {
										$$renderer5.push(
											`<iconify-icon${attr('icon', field.iconEmpty || 'material-symbols:star-outline')} width="24" class="text-surface-400"></iconify-icon>`
										);
									},
									full = function ($$renderer5) {
										$$renderer5.push(
											`<iconify-icon${attr('icon', field.iconFull || 'material-symbols:star')} width="24"${attr_class(clsx(error ? 'text-error-500' : 'text-warning-500'))}></iconify-icon>`
										);
									};
								RatingGroup.Item($$renderer4, {
									index: i + 1,
									empty,
									full,
									$$slots: { empty: true, full: true }
								});
							}
							$$renderer4.push(`<!---->`);
						}
						$$renderer4.push(`<!--]-->`);
					},
					$$slots: { default: true }
				});
				$$renderer3.push(`<!---->`);
			},
			$$slots: { default: true }
		});
		$$renderer2.push(`<!----></div> `);
		if (error) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<p class="absolute bottom-0 left-0 w-full text-center text-xs text-error-500" role="alert">${escape_html(error)}</p>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div>`);
		bind_props($$props, { value });
	});
}
export { Input as default };
//# sourceMappingURL=Input19.js.map
