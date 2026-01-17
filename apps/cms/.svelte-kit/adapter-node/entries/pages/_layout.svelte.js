import {
	f as attributes,
	p as props_id,
	e as ensure_array_like,
	c as stringify,
	a as attr,
	d as escape_html,
	b as attr_style,
	l as head
} from '../../chunks/index5.js';
import 'iconify-icon';
import { p as page } from '../../chunks/index6.js';
import { t as toaster } from '../../chunks/store.svelte.js';
import { c as createContext, m as mergeProps, u as useMachine, n as normalizeProps } from '../../chunks/machine.svelte.js';
import { group, connect, machine } from '@zag-js/toast';
import 'clsx';
import { g as getLocale } from '../../chunks/runtime.js';
import '../../chunks/logger.js';
import { publicEnv } from '../../chunks/globalSettings.svelte.js';
import '../../chunks/UIStore.svelte.js';
import '@sveltejs/kit/internal';
import '../../chunks/exports.js';
import '../../chunks/utils3.js';
import '@sveltejs/kit/internal/server';
import '../../chunks/state.svelte.js';
import { c as collections } from '../../chunks/collectionStore.svelte.js';
import '../../chunks/widgetStore.svelte.js';
import '../../chunks/utils.js';
import '../../chunks/screenSizeStore.svelte.js';
import '../../chunks/schemas.js';
import { S as StatusTypes } from '../../chunks/definitions.js';
/* empty css                                                 */
const RootContext = createContext();
function Action_trigger($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const toast = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(toast().getActionTriggerProps(), rest);
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
function X($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const { ...rest } = props;
		const attributes$1 = mergeProps(
			{
				xmlns: 'http://www.w3.org/2000/svg',
				width: '24',
				height: '24',
				viewBox: '0 0 24 24',
				fill: 'none',
				stroke: 'currentColor',
				'stroke-width': '2',
				'stroke-linecap': 'round',
				'stroke-linejoin': 'round'
			},
			rest
		);
		$$renderer2.push(
			`<svg${attributes({ ...attributes$1 }, void 0, void 0, void 0, 3)}><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>`
		);
	});
}
function x($$renderer) {
	X($$renderer, {});
}
function Close_trigger($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const toast = RootContext.consume();
		const { element, children = x, ...rest } = props;
		const attributes$1 = mergeProps(toast().getCloseTriggerProps(), rest);
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
function Description($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const toast = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(toast().getDescriptionProps(), rest);
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
const GroupContext = createContext();
function Group($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const id = props_id($$renderer2);
		const { $$slots, $$events, ...props } = $$props;
		const { element, children, toaster: toaster2, ...rest } = props;
		const service = useMachine(group.machine, () => ({ id, store: toaster2 }));
		const api = group.connect(service, normalizeProps);
		const attributes$1 = mergeProps(api.getGroupProps(), rest);
		GroupContext.provide(() => service);
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<div${attributes({ ...attributes$1 })}><!--[-->`);
			const each_array = ensure_array_like(api.getToasts());
			for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
				let toast = each_array[$$index];
				children?.($$renderer2, toast);
				$$renderer2.push(`<!---->`);
			}
			$$renderer2.push(`<!--]--></div>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function Message($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps({ 'data-scope': 'toast', 'data-part': 'message' }, rest);
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
		const toast = RootContext.consume();
		const { children } = props;
		children($$renderer2, toast);
		$$renderer2.push(`<!---->`);
	});
}
function Root($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const group2 = GroupContext.consume();
		const { element, children, toast: toastProps, ...rest } = props;
		const service = useMachine(machine, () => ({ ...toastProps, parent: group2() }));
		const toast = connect(service, normalizeProps);
		const attributes$1 = mergeProps(toast.getRootProps(), rest);
		RootContext.provide(() => toast);
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<div${attributes({ ...attributes$1 })}><div${attributes({ ...toast.getGhostBeforeProps() })}></div> `);
			children?.($$renderer2);
			$$renderer2.push(`<!----> <div${attributes({ ...toast.getGhostAfterProps() })}></div></div>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function Title($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const toast = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(toast().getTitleProps(), rest);
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
const Toast = Object.assign(Root, {
	Context: Root_context,
	Group,
	Message,
	Title,
	Description,
	ActionTrigger: Action_trigger,
	CloseTrigger: Close_trigger
});
function ToastManager($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { position = 'top-right', showProgress = true } = $$props;
		const positionClasses = {
			'top-right': 'top-4 right-4 inset-auto items-end',
			'top-left': 'top-4 left-4 inset-auto items-start',
			'bottom-right': 'bottom-4 right-4 inset-auto items-end justify-end',
			'bottom-left': 'bottom-4 left-4 inset-auto items-start justify-end',
			'top-center': 'top-4 left-1/2 -translate-x-1/2 inset-auto items-center',
			'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2 inset-auto items-center justify-end'
		};
		const toastConfig = {
			success: {
				gradient: 'gradient-primary',
				textColor: 'text-white',
				icon: 'mdi:check-circle',
				defaultTitle: 'Success'
			},
			warning: {
				gradient: 'gradient-warning',
				textColor: 'text-black',
				icon: 'mdi:alert',
				defaultTitle: 'Warning'
			},
			error: {
				gradient: 'gradient-error',
				textColor: 'text-white',
				icon: 'mdi:alert-circle',
				defaultTitle: 'Error'
			},
			info: {
				gradient: 'gradient-tertiary',
				textColor: 'text-white',
				icon: 'mdi:information',
				defaultTitle: 'Info'
			}
		};
		function getToastClasses(type) {
			if (!type || !(type in toastConfig)) {
				return 'bg-surface-100 dark:bg-surface-800 text-surface-900 dark:text-surface-100 border border-surface-300 dark:border-surface-600';
			}
			const config = toastConfig[type];
			return `${config.gradient} ${config.textColor}`;
		}
		function getToastIcon(type) {
			if (!type || !(type in toastConfig)) return null;
			return toastConfig[type].icon;
		}
		(() => {
			if (position.includes('right')) return { x: 100, duration: 300 };
			if (position.includes('left')) return { x: -100, duration: 300 };
			if (position.includes('top')) return { y: -50, duration: 300 };
			return { y: 50, duration: 300 };
		})();
		$$renderer2.push(`<!---->`);
		{
			let children = function ($$renderer3, toast) {
				$$renderer3.push(`<div class="relative" role="alert" aria-live="polite">`);
				Toast($$renderer3, {
					toast,
					class: `card min-w-80 max-w-100 shadow-2xl rounded-xl overflow-hidden ${stringify(getToastClasses(toast.type))}`,
					children: ($$renderer4) => {
						$$renderer4.push(`<!---->`);
						Toast.Message($$renderer4, {
							class: 'flex flex-col gap-1 p-4 pr-10 relative',
							children: ($$renderer5) => {
								if (toast.title) {
									$$renderer5.push('<!--[-->');
									$$renderer5.push(`<!---->`);
									Toast.Title($$renderer5, {
										class: 'font-bold text-base flex items-center gap-2',
										children: ($$renderer6) => {
											if (getToastIcon(toast.type)) {
												$$renderer6.push('<!--[-->');
												$$renderer6.push(`<iconify-icon${attr('icon', getToastIcon(toast.type))} width="22" class="shrink-0"></iconify-icon>`);
											} else {
												$$renderer6.push('<!--[!-->');
											}
											$$renderer6.push(`<!--]--> <span>${escape_html(toast.title)}</span>`);
										},
										$$slots: { default: true }
									});
									$$renderer5.push(`<!---->`);
								} else {
									$$renderer5.push('<!--[!-->');
								}
								$$renderer5.push(`<!--]--> <!---->`);
								Toast.Description($$renderer5, {
									class: 'text-sm opacity-95 leading-relaxed',
									children: ($$renderer6) => {
										$$renderer6.push(`<!---->${escape_html(toast.description)}`);
									},
									$$slots: { default: true }
								});
								$$renderer5.push(`<!----> `);
								if (toast.action) {
									$$renderer5.push('<!--[-->');
									$$renderer5.push(`<div class="mt-3 flex gap-2"><!---->`);
									Toast.ActionTrigger($$renderer5, {
										class: `btn-sm ${stringify(toast.type === 'warning' ? 'preset-filled-surface-900' : 'preset-filled-surface-50')} text-xs font-medium`,
										onclick: () => {
											toast.action?.onClick?.();
										},
										children: ($$renderer6) => {
											$$renderer6.push(`<!---->${escape_html(toast.action.label)}`);
										},
										$$slots: { default: true }
									});
									$$renderer5.push(`<!----></div>`);
								} else {
									$$renderer5.push('<!--[!-->');
								}
								$$renderer5.push(`<!--]-->`);
							},
							$$slots: { default: true }
						});
						$$renderer4.push(`<!----> <!---->`);
						Toast.CloseTrigger($$renderer4, {
							class:
								'absolute right-2 top-2 p-1.5 rounded-full opacity-70 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-opacity',
							'aria-label': 'Dismiss notification',
							children: ($$renderer5) => {
								$$renderer5.push(`<iconify-icon icon="mdi:close" width="18"></iconify-icon>`);
							},
							$$slots: { default: true }
						});
						$$renderer4.push(`<!----> `);
						if (showProgress && toast.duration && toast.duration > 0) {
							$$renderer4.push('<!--[-->');
							$$renderer4.push(
								`<div class="absolute bottom-0 left-0 right-0 h-1 bg-black/10 dark:bg-white/10"><div class="h-full bg-current opacity-50 animate-shrink svelte-n1orkn"${attr_style(`animation-duration: ${stringify(toast.duration)}ms;`)}></div></div>`
							);
						} else {
							$$renderer4.push('<!--[!-->');
						}
						$$renderer4.push(`<!--]-->`);
					},
					$$slots: { default: true }
				});
				$$renderer3.push(`<!----></div>`);
			};
			Toast.Group($$renderer2, {
				toaster,
				class: `fixed z-9999 flex ${stringify(position.includes('bottom') ? 'flex-col-reverse' : 'flex-col')} gap-3 ${stringify(positionClasses[position])}`,
				children,
				$$slots: { default: true }
			});
		}
		$$renderer2.push(`<!---->`);
	});
}
function getIsPublish() {
	const cv = collections.activeValue;
	if (cv?.status) {
		return cv.status === StatusTypes.publish;
	}
	const collectionStatus = collections.active?.status;
	const defaultStatus = collectionStatus || StatusTypes.unpublish;
	return defaultStatus === StatusTypes.publish;
}
getIsPublish();
function _layout($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { children } = $$props;
		getLocale();
		let isMounted = false;
		const siteName = publicEnv?.SITE_NAME || 'SveltyCMS';
		(() => {
			const path = page.url.pathname;
			const isAuthRoute = path.includes('/login') || path.includes('/register');
			const isSetupRoute = path.includes('/setup');
			return !isAuthRoute && !isSetupRoute && isMounted;
		})();
		head('12qhfyh', $$renderer2, ($$renderer3) => {
			$$renderer3.title(($$renderer4) => {
				$$renderer4.push(`<title>${escape_html(siteName)}</title>`);
			});
		});
		$$renderer2.push(`<!---->`);
		{
			ToastManager($$renderer2, { position: 'bottom-right' });
			$$renderer2.push(`<!----> <div class="flex h-screen w-screen overflow-hidden bg-surface-50 dark:bg-surface-900">`);
			{
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--> <main class="relative flex h-full flex-1 flex-col overflow-hidden"><div class="h-full w-full overflow-auto">`);
			children?.($$renderer2);
			$$renderer2.push(`<!----></div></main> `);
			{
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--></div>`);
		}
		$$renderer2.push(`<!---->`);
	});
}
export { _layout as default };
//# sourceMappingURL=_layout.svelte.js.map
