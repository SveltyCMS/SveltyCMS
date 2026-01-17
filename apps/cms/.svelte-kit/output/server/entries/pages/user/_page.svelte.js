import {
	f as attributes,
	p as props_id,
	g as attr_class,
	d as escape_html,
	i as clsx,
	c as stringify,
	a as attr,
	e as ensure_array_like
} from '../../../chunks/index5.js';
import '@sveltejs/kit/internal';
import '../../../chunks/exports.js';
import '../../../chunks/utils3.js';
import '@sveltejs/kit/internal/server';
import '../../../chunks/state.svelte.js';
import { d as debounce } from '../../../chunks/utils.js';
import { logger } from '../../../chunks/logger.js';
import { d as avatarSrc } from '../../../chunks/store.svelte.js';
import { P as PermissionGuard } from '../../../chunks/PermissionGuard.js';
import { F as FloatingInput } from '../../../chunks/floatingInput.js';
import {
	ao as boolean_yes,
	ap as boolean_no,
	aq as multibuttontoken_modalbody,
	ar as adminarea_title,
	as as multibuttontoken_modaltitle,
	at as adminarea_adminarea,
	au as adminarea_emailtoken,
	av as adminarea_showtoken,
	aw as adminarea_hideuserlist,
	ax as adminarea_userlist,
	ay as entrylist_dnd,
	az as entrylist_all,
	aA as entrylist_filter,
	aB as adminarea_nouser,
	aC as userpage_title,
	aD as userpage_editavatar,
	aE as userpage_user_id,
	aF as role,
	aG as username,
	aH as email,
	aI as form_password,
	aJ as userpage_edit_usersetting,
	ae as button_delete
} from '../../../chunks/_index.js';
import { T as TableFilter } from '../../../chunks/TableFilter.js';
import { T as TableIcons, h as html } from '../../../chunks/TableIcons.js';
import { T as TablePagination } from '../../../chunks/TablePagination.js';
import '../../../chunks/client.js';
import '../../../chunks/formSchemas.js';
import { o as onDestroy } from '../../../chunks/index-server.js';
import { P as PermissionType, a as PermissionAction } from '../../../chunks/types.js';
import '../../../chunks/index7.js';
import { c as createContext, m as mergeProps, u as useMachine, n as normalizeProps } from '../../../chunks/machine.svelte.js';
import 'clsx';
import { machine, connect, splitProps } from '@zag-js/avatar';
import '../../../chunks/runtime.js';
import { P as PageTitle } from '../../../chunks/PageTitle.js';
import '../../../chunks/collectionStore.svelte.js';
const RootContext = createContext();
function Fallback($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const avatar = RootContext.consume();
		const { element, children, ...rest } = props;
		const attributes$1 = mergeProps(avatar().getFallbackProps(), rest);
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<span${attributes({ ...attributes$1 })}>`);
			children?.($$renderer2);
			$$renderer2.push(`<!----></span>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function Image($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const avatar = RootContext.consume();
		const { element, ...rest } = props;
		const attributes$1 = mergeProps(avatar().getImageProps(), rest);
		if (element) {
			$$renderer2.push('<!--[-->');
			element($$renderer2, attributes$1);
			$$renderer2.push(`<!---->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<img${attributes({ ...attributes$1 })} onload="this.__e=event" onerror="this.__e=event"/>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function Root_context($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const avatar = RootContext.consume();
		const { children } = props;
		children($$renderer2, avatar);
		$$renderer2.push(`<!---->`);
	});
}
function Root_provider($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { $$slots, $$events, ...props } = $$props;
		const { element, children, value: avatar, ...rest } = props;
		const attributes$1 = mergeProps(avatar().getRootProps(), rest);
		RootContext.provide(() => avatar());
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
function useAvatar(props) {
	const service = useMachine(machine, props);
	const avatar = connect(service, normalizeProps);
	return () => avatar;
}
function Root($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const id = props_id($$renderer2);
		const { $$slots, $$events, ...props } = $$props;
		const [avatarProps, componentProps] = splitProps(props);
		const { element, children, ...rest } = componentProps;
		const avatar = useAvatar(() => ({ ...avatarProps, id }));
		const attributes$1 = mergeProps(avatar().getRootProps(), rest);
		RootContext.provide(() => avatar());
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
const Avatar = Object.assign(Root, {
	Provider: Root_provider,
	Context: Root_context,
	Image,
	Fallback
});
function Boolean$1($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { value = false } = $$props;
		$$renderer2.push(
			`<span${attr_class(clsx(value ? 'gradient-error badge rounded' : 'gradient-primary badge rounded'))}>${escape_html(value ? boolean_yes() : boolean_no())}</span>`
		);
	});
}
function Role($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { value, roles = [] } = $$props;
		const roleClasses = (roleId) => {
			const role2 = roles.find((r) => r._id === roleId);
			if (!role2) {
				const defaultRole = roles.find((r) => r._id === 'user');
				return defaultRole?.color || 'text-white';
			}
			return role2.color || 'text-white';
		};
		const iconForRole = (roleId) => {
			const role2 = roles.find((r) => r._id === roleId);
			if (!role2) {
				const defaultRole = roles.find((r) => r._id === 'user');
				return defaultRole?.icon || 'material-symbols:person';
			}
			return role2.icon || 'material-symbols:person';
		};
		const roleName = (roleId) => {
			const role2 = roles.find((r) => r._id === roleId);
			if (!role2) {
				const defaultRole = roles.find((r) => r._id === 'user');
				return defaultRole?.name || 'User';
			}
			return role2.name || 'User';
		};
		$$renderer2.push(`<span${attr_class(`badge ${stringify(roleClasses(value))}`)}>`);
		if (iconForRole(value)) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<iconify-icon${attr('icon', iconForRole(value))} width="20"></iconify-icon> ${escape_html(roleName(value))}`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<span>${escape_html(roleName(value))}</span>`);
		}
		$$renderer2.push(`<!--]--></span>`);
	});
}
function Multibutton($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const isUser = (row) => {
			return !!row && typeof row === 'object' && '_id' in row;
		};
		const isToken = (row) => {
			return !!row && typeof row === 'object' && 'token' in row;
		};
		let { selectedRows, type = 'user' } = $$props;
		let listboxValue = 'edit';
		let isDropdownOpen = false;
		function handleClickOutside(event) {}
		onDestroy(() => {
			document.removeEventListener('click', handleClickOutside);
		});
		const safeSelectedRows = Array.isArray(selectedRows) ? selectedRows.filter(Boolean) : [];
		const isDisabled = safeSelectedRows.length === 0;
		safeSelectedRows.length > 1;
		const blockState = () => {
			if (safeSelectedRows.length === 0) return null;
			if (type === 'user') {
				const users = safeSelectedRows.filter(isUser);
				if (users.length === 0) return null;
				const blockedCount = users.filter((user) => user.blocked).length;
				const unblockedCount = users.filter((user) => !user.blocked).length;
				if (blockedCount === users.length) return 'all-blocked';
				if (unblockedCount === users.length) return 'all-unblocked';
				return 'mixed';
			} else {
				const tokens = safeSelectedRows.filter(isToken);
				if (tokens.length === 0) return null;
				const blockedCount = tokens.filter((token) => token.blocked).length;
				const unblockedCount = tokens.filter((token) => !token.blocked).length;
				if (blockedCount === tokens.length) return 'all-blocked';
				if (unblockedCount === tokens.length) return 'all-unblocked';
				return 'mixed';
			}
		};
		const availableActions = (() => {
			const baseActions = ['edit', 'delete'];
			const currentBlockState = blockState;
			if (currentBlockState() === 'all-blocked') {
				return [...baseActions, 'unblock'];
			} else if (currentBlockState() === 'all-unblocked') {
				return [...baseActions, 'block'];
			} else if (currentBlockState() === 'mixed') {
				return [...baseActions, 'block', 'unblock'];
			}
			return baseActions;
		})();
		(() => {
			const actions = Array.isArray(availableActions) ? availableActions : [];
			return actions.filter((action) => action !== listboxValue);
		})();
		const actionConfig = {
			edit: {
				buttonClass: 'gradient-primary',
				hoverClass: 'gradient-primary-hover',
				iconValue: 'bi:pencil-fill',
				label: 'Edit',
				modalTitle: () => (type === 'user' ? adminarea_title() : multibuttontoken_modaltitle()),
				modalBody: () => (type === 'user' ? 'Modify your data and then press Save.' : multibuttontoken_modalbody()),
				endpoint: () => {
					if (type === 'user') {
						return '/api/user/updateUserAttributes';
					} else {
						const firstRow = safeSelectedRows[0];
						if (isToken(firstRow)) {
							return `/api/token/${firstRow.token}`;
						}
						throw new Error('No token selected for editing');
					}
				},
				method: () => 'PUT',
				toastMessage: () => `${type === 'user' ? 'User' : 'Token'} Updated`,
				toastBackground: 'gradient-primary'
			},
			delete: {
				buttonClass: 'gradient-error',
				hoverClass: 'gradient-error-hover',
				iconValue: 'bi:trash3-fill',
				label: 'Delete',
				modalTitle: () => {
					if (type === 'user') {
						return `Please Confirm User <span class="text-error-500 font-bold">Deletion</span>`;
					}
					return `Please Confirm Token <span class="text-error-500 font-bold">Deletion</span>`;
				},
				modalBody: () => {
					if (type === 'user') {
						if (safeSelectedRows.length === 1) {
							const user = safeSelectedRows[0];
							if (isUser(user)) {
								return `Are you sure you want to <span class="text-error-500 font-semibold">delete</span> user <span class="text-tertiary-500 font-medium">${user.email}</span>? This action cannot be undone and will permanently remove the user from the system.`;
							}
							return '';
						} else {
							return `Are you sure you want to <span class="text-error-500 font-semibold">delete</span> <span class="text-tertiary-500 font-medium">${safeSelectedRows.length} users</span>? This action cannot be undone and will permanently remove all selected users from the system.`;
						}
					} else {
						if (safeSelectedRows.length === 1) {
							const token = safeSelectedRows[0];
							if (isToken(token)) {
								return `Are you sure you want to <span class="text-error-500 font-semibold">delete</span> token for <span class="text-tertiary-500 font-medium">${token.email}</span>? This action cannot be undone and will permanently remove the token from the system.`;
							}
							return '';
						} else {
							return `Are you sure you want to <span class="text-error-500 font-semibold">delete</span> <span class="text-tertiary-500 font-medium">${safeSelectedRows.length} tokens</span>? This action cannot be undone and will permanently remove all selected tokens from the system.`;
						}
					}
				},
				endpoint: () => (type === 'user' ? '/api/user/batch' : '/api/token/batch'),
				method: () => 'POST',
				toastMessage: () => `${type === 'user' ? 'Users' : 'Tokens'} Deleted`,
				toastBackground: 'preset-filled-success-500'
			},
			block: {
				buttonClass: 'gradient-pink',
				hoverClass: 'gradient-yellow-hover',
				iconValue: 'material-symbols:lock',
				label: 'Block',
				modalTitle: () => {
					if (type === 'user') {
						return `Please Confirm User <span class="text-error-500 font-bold">Block</span>`;
					}
					return `Please Confirm Token <span class="text-error-500 font-bold">Block</span>`;
				},
				modalBody: () => {
					if (type === 'user') {
						if (safeSelectedRows.length === 1) {
							const user = safeSelectedRows[0];
							if (isUser(user)) {
								return `Are you sure you want to <span class="text-error-500 font-semibold">block</span> user <span class="text-tertiary-500 font-medium">${user.email}</span>? This will prevent them from accessing the system.`;
							}
							return '';
						} else {
							return `Are you sure you want to <span class="text-error-500 font-semibold">block</span> <span class="text-tertiary-500 font-medium">${safeSelectedRows.length} users</span>? This will prevent them from accessing the system.`;
						}
					} else {
						if (safeSelectedRows.length === 1) {
							const token = safeSelectedRows[0];
							if (isToken(token)) {
								return `Are you sure you want to <span class="text-error-500 font-semibold">block</span> token for <span class="text-tertiary-500 font-medium">${token.email}</span>? This will prevent the token from being used.`;
							}
							return '';
						} else {
							return `Are you sure you want to <span class="text-error-500 font-semibold">block</span> <span class="text-tertiary-500 font-medium">${safeSelectedRows.length} tokens</span>? This will prevent them from being used.`;
						}
					}
				},
				endpoint: () => (type === 'user' ? '/api/user/batch' : '/api/token/batch'),
				method: () => 'POST',
				toastMessage: () => `${type === 'user' ? 'Users' : 'Tokens'} Blocked`,
				toastBackground: 'preset-filled-success-500'
			},
			unblock: {
				buttonClass: 'gradient-yellow',
				hoverClass: 'gradient-primary-hover',
				iconValue: 'material-symbols:lock-open',
				label: 'Unblock',
				modalTitle: () => {
					if (type === 'user') {
						return `Please Confirm User <span class="text-success-500 font-bold">Unblock</span>`;
					}
					return `Please Confirm Token <span class="text-success-500 font-bold">Unblock</span>`;
				},
				modalBody: () => {
					if (type === 'user') {
						if (safeSelectedRows.length === 1) {
							const user = safeSelectedRows[0];
							if (isUser(user)) {
								return `Are you sure you want to <span class="text-success-500 font-semibold">unblock</span> user <span class="text-tertiary-500 font-medium">${user.email}</span>? This will allow them to access the system again.`;
							}
							return '';
						} else {
							return `Are you sure you want to <span class="text-success-500 font-semibold">unblock</span> <span class="text-tertiary-500 font-medium">${safeSelectedRows.length} users</span>? This will allow them to access the system again.`;
						}
					} else {
						if (safeSelectedRows.length === 1) {
							const token = safeSelectedRows[0];
							if (isToken(token)) {
								return `Are you sure you want to <span class="text-success-500 font-semibold">unblock</span> token for <span class="text-tertiary-500 font-medium">${token.email}</span>? This will allow the token to be used again.`;
							}
							return '';
						} else {
							return `Are you sure you want to <span class="text-success-500 font-semibold">unblock</span> <span class="text-tertiary-500 font-medium">${safeSelectedRows.length} tokens</span>? This will allow them to be used again.`;
						}
					}
				},
				endpoint: () => (type === 'user' ? '/api/user/batch' : '/api/token/batch'),
				method: () => 'POST',
				toastMessage: () => `${type === 'user' ? 'Users' : 'Tokens'} Unblocked`,
				toastBackground: 'preset-filled-success-500'
			}
		};
		$$renderer2.push(
			`<div class="relative flex items-center"><div${attr_class(`group/main relative flex items-center shadow-xl overflow-visible transition-all duration-200 ${stringify(!isDisabled ? 'active:scale-95 cursor-pointer' : '')} rounded-l-full rounded-r-md border border-white/20 ${stringify('')}`)} role="group"><button type="button"${attr('disabled', isDisabled || listboxValue === 'delete', true)}${attr_class(`h-[40px] min-w-[120px] font-bold transition-all duration-200 ${stringify(!isDisabled ? 'active:scale-95' : 'pointer-events-none opacity-50 grayscale')} ${stringify(actionConfig[listboxValue].buttonClass)} text-white rounded-l-full rounded-r-none px-6 flex items-center justify-center gap-2 border-r border-white/20`)}${attr('aria-label', `${stringify(listboxValue)} selected items`)}><iconify-icon${attr('icon', actionConfig[listboxValue].iconValue)} width="20"></iconify-icon> <span class="uppercase tracking-wider">${escape_html(listboxValue)}</span></button> <button type="button"${attr('disabled', isDisabled, true)}${attr_class(`h-[40px] w-[40px] transition-all duration-200 text-white flex items-center justify-center shadow-inner rounded-r-md ${stringify(!isDisabled ? 'bg-surface-800 hover:bg-surface-700 active:scale-95 cursor-pointer' : 'bg-surface-800 opacity-50 pointer-events-none')}`)} aria-haspopup="menu"${attr('aria-expanded', isDropdownOpen)} aria-label="Toggle actions menu"><iconify-icon icon="ic:round-keyboard-arrow-down" width="24"${attr_class(`transition-transform duration-200 ${stringify('')}`)}></iconify-icon></button> `
		);
		{
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div></div>`);
	});
}
function AdminArea($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		function isToken(row) {
			return 'token' in row && typeof row.token === 'string';
		}
		function isUser(row) {
			return '_id' in row && typeof row._id === 'string';
		}
		const { currentUser = null, roles = [] } = $$props;
		const waitFilter = debounce(300);
		let tableData = [];
		let totalItems = 0;
		let globalSearchValue = '';
		let searchShow = false;
		let filterShow = false;
		let columnShow = false;
		let selectAll = false;
		let selectedMap = {};
		let density = (() => {
			const settings = localStorage.getItem('userPaginationSettings');
			return settings ? (JSON.parse(settings).density ?? 'normal') : 'normal';
		})();
		let selectAllColumns = true;
		let currentPage = 1;
		let rowsPerPage = 10;
		let filters = {};
		let sorting = { isSorted: 0 };
		let displayTableHeaders = [];
		function normalizeMediaUrl(url) {
			if (!url) return '/Default_User.svg';
			try {
				if (url.startsWith('data:') || /^https?:\/\//i.test(url)) return url;
				if (/^\/?[^\s?]+\.svg$/i.test(url)) return url.startsWith('/') ? url : `/${url}`;
				let clean = url.replace(/^\/+/, '');
				clean = clean.replace(/^mediaFolder\//, '').replace(/^files\//, '');
				clean = clean.replace(/^\/+/, '');
				if (clean === 'files' || clean === '') return '/Default_User.svg';
				return `/files/${clean}?t=${Date.now()}`;
			} catch {
				return '/Default_User.svg';
			}
		}
		function getRemainingTime(expiresDate) {
			if (!expiresDate) return 'Never';
			const now = /* @__PURE__ */ new Date();
			const expires = new Date(expiresDate);
			const diffMs = expires.getTime() - now.getTime();
			if (diffMs <= 0) return 'Expired';
			const diffMinutes = Math.floor(diffMs / (1e3 * 60));
			const diffHours = Math.floor(diffMs / (1e3 * 60 * 60));
			const diffDays = Math.floor(diffMs / (1e3 * 60 * 60 * 24));
			if (diffDays > 0) {
				const remainingHours = Math.floor((diffMs % (1e3 * 60 * 60 * 24)) / (1e3 * 60 * 60));
				return remainingHours > 0 ? `${diffDays}d ${remainingHours}h` : `${diffDays}d`;
			} else if (diffHours > 0) {
				const remainingMinutes = Math.floor((diffMs % (1e3 * 60 * 60)) / (1e3 * 60));
				return remainingMinutes > 0 ? `${diffHours}h ${remainingMinutes}m` : `${diffHours}h`;
			} else {
				return `${diffMinutes}m`;
			}
		}
		function formatDate(value) {
			if (value === null || value === void 0 || value === '') return '-';
			try {
				const d = value instanceof Date ? value : new Date(String(value));
				if (isNaN(d.getTime())) return '-';
				return d.toLocaleString();
			} catch {
				return '-';
			}
		}
		const pagesCount = (() => Math.ceil(totalItems / rowsPerPage) || 1)();
		let selectedRows = (() =>
			Object.entries(selectedMap)
				.filter(([, isSelected]) => isSelected)
				.map(([index]) => tableData[parseInt(index)])
				.filter((item) => item !== void 0 && item !== null))();
		function handleInputChange(value, headerKey) {
			if (value) {
				const newFilters = { ...filters, [headerKey]: value };
				waitFilter(() => {
					filters = newFilters;
				});
			} else {
				const newFilters = { ...filters };
				delete newFilters[headerKey];
				filters = newFilters;
			}
		}
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer3) {
			$$renderer3.push(
				`<div class="flex flex-col"><p class="h2 mb-2 text-center text-3xl font-bold dark:text-white">${escape_html(adminarea_adminarea())}</p> <div class="flex flex-col flex-wrap items-center justify-evenly gap-2 sm:flex-row xl:justify-between"><button${attr('aria-label', adminarea_emailtoken())} class="gradient-primary btn w-full text-white sm:max-w-xs"><iconify-icon icon="material-symbols:mail" color="white" width="18" class="mr-1"></iconify-icon> <span class="whitespace-normal wrap-break-word">${escape_html(adminarea_emailtoken())}</span></button> `
			);
			PermissionGuard($$renderer3, {
				config: {
					contextId: 'user:manage',
					name: 'Manage User Tokens',
					description: 'Allows management of user tokens in the admin area.',
					action: PermissionAction.MANAGE,
					contextType: PermissionType.USER
				},
				children: ($$renderer4) => {
					$$renderer4.push(
						`<button${attr('aria-label', adminarea_showtoken())} class="gradient-secondary btn w-full text-white sm:max-w-xs"><iconify-icon icon="material-symbols:key-outline" color="white" width="18" class="mr-1"></iconify-icon> <span>${escape_html(adminarea_showtoken())}</span></button> `
					);
					{
						$$renderer4.push('<!--[!-->');
					}
					$$renderer4.push(`<!--]-->`);
				}
			});
			$$renderer3.push(
				`<!----> <button${attr(
					'aria-label',
					adminarea_hideuserlist()
				)} class="gradient-tertiary btn w-full text-white sm:max-w-xs"><iconify-icon icon="mdi:account-circle" color="white" width="18" class="mr-1"></iconify-icon> <span>${escape_html(
					adminarea_hideuserlist()
				)}</span></button></div> `
			);
			{
				$$renderer3.push('<!--[-->');
				$$renderer3.push(
					`<div class="my-4 flex flex-wrap items-center justify-between gap-1"><h2 class="order-1 text-xl font-bold text-tertiary-500 dark:text-primary-500">`
				);
				{
					$$renderer3.push('<!--[-->');
					$$renderer3.push(`${escape_html(adminarea_userlist())}`);
				}
				$$renderer3.push(`<!--]--></h2> <div class="order-3 sm:order-2">`);
				TableFilter($$renderer3, {
					get globalSearchValue() {
						return globalSearchValue;
					},
					set globalSearchValue($$value) {
						globalSearchValue = $$value;
						$$settled = false;
					},
					get searchShow() {
						return searchShow;
					},
					set searchShow($$value) {
						searchShow = $$value;
						$$settled = false;
					},
					get filterShow() {
						return filterShow;
					},
					set filterShow($$value) {
						filterShow = $$value;
						$$settled = false;
					},
					get columnShow() {
						return columnShow;
					},
					set columnShow($$value) {
						columnShow = $$value;
						$$settled = false;
					},
					get density() {
						return density;
					},
					set density($$value) {
						density = $$value;
						$$settled = false;
					}
				});
				$$renderer3.push(`<!----></div> <div class="order-2 flex items-center justify-center sm:order-3">`);
				Multibutton($$renderer3, {
					selectedRows,
					type: 'user'
				});
				$$renderer3.push(`<!----></div></div> `);
				if (tableData && tableData.length > 0) {
					$$renderer3.push('<!--[-->');
					if (columnShow) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<div class="rounded-b-0 flex flex-col justify-center rounded-t-md border-b bg-surface-300 text-center dark:bg-surface-700"><div class="text-white dark:text-primary-500">${escape_html(entrylist_dnd())}</div> <div class="my-2 flex w-full items-center justify-center gap-1"><label class="mr-2"><input type="checkbox"${attr('checked', selectAllColumns, true)}/> ${escape_html(entrylist_all())}</label> <section class="flex flex-wrap justify-center gap-1 rounded-md p-2"><!--[-->`
						);
						const each_array = ensure_array_like(displayTableHeaders);
						for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
							let header = each_array[$$index];
							$$renderer3.push(
								`<button${attr_class(`chip ${stringify(header.visible ? 'preset-filled-secondary-500' : 'preset-ghost-secondary-500')} w-100 mr-2 flex items-center justify-center`)}>`
							);
							if (header.visible) {
								$$renderer3.push('<!--[-->');
								$$renderer3.push(`<span><iconify-icon icon="fa:check"></iconify-icon></span>`);
							} else {
								$$renderer3.push('<!--[!-->');
							}
							$$renderer3.push(`<!--]--> <span class="ml-2 capitalize">${escape_html(header.label)}</span></button>`);
						}
						$$renderer3.push(`<!--]--></section></div></div>`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(
						`<!--]--> <div class="table-container max-h-[calc(100vh-120px)] overflow-auto"><table${attr_class(`table table-interactive ${stringify(density === 'compact' ? 'table-compact' : density === 'normal' ? '' : 'table-comfortable')}`)}><thead class="divide-x divide-surface-200/50 dark:divide-surface-50 text-surface-500 dark:text-surface-300 bg-secondary-100 dark:bg-surface-800/50">`
					);
					if (filterShow) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(`<tr class="divide-x divide-surface-200/50 dark:divide-surface-700/50"><th>`);
						if (Object.keys(filters).length > 0) {
							$$renderer3.push('<!--[-->');
							$$renderer3.push(
								`<button aria-label="Clear All Filters" class="preset-outline btn-icon"><iconify-icon icon="material-symbols:close" width="24"></iconify-icon></button>`
							);
						} else {
							$$renderer3.push('<!--[!-->');
						}
						$$renderer3.push(`<!--]--></th><!--[-->`);
						const each_array_1 = ensure_array_like(displayTableHeaders.filter((header) => header.visible));
						for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
							let header = each_array_1[$$index_1];
							$$renderer3.push(`<th><div class="flex items-center justify-between">`);
							FloatingInput($$renderer3, {
								type: 'text',
								icon: 'material-symbols:search-rounded',
								label: entrylist_filter(),
								name: header.key,
								onInput: (value) => handleInputChange(value, header.key)
							});
							$$renderer3.push(`<!----></div></th>`);
						}
						$$renderer3.push(`<!--]--></tr>`);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(
						`<!--]--><tr class="divide-x divide-surface-300 dark:divide-surface-50 border-b border-surface-300 dark:border-surface-50 font-semibold tracking-wide uppercase text-xs">`
					);
					TableIcons($$renderer3, {
						cellClass: 'w-10 text-center',
						checked: selectAll,
						onCheck: (checked) => {
							selectAll = checked;
							for (let i = 0; i < tableData.length; i++) {
								selectedMap[i] = checked;
							}
						}
					});
					$$renderer3.push(`<!----><!--[-->`);
					const each_array_2 = ensure_array_like(displayTableHeaders.filter((header) => header.visible));
					for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
						let header = each_array_2[$$index_2];
						$$renderer3.push(
							`<th class="cursor-pointer text-tertiary-500 dark:text-primary-500 hover:bg-surface-100/50 dark:hover:bg-surface-800/50 transition-colors"><div class="flex items-center justify-center gap-1">${escape_html(header.label)} <iconify-icon icon="material-symbols:arrow-upward-rounded" width="18"${attr_class(
								'origin-center duration-300 ease-in-out',
								void 0,
								{
									up: sorting.isSorted === 1,
									invisible: sorting.isSorted === 0
								}
							)}></iconify-icon></div></th>`
						);
					}
					$$renderer3.push(`<!--]--></tr></thead><tbody class="divide-y divide-surface-200/30 dark:divide-surface-700/30"><!--[-->`);
					const each_array_3 = ensure_array_like(tableData);
					for (let index = 0, $$length = each_array_3.length; index < $$length; index++) {
						let row = each_array_3[index];
						isToken(row) ? row.expires : null;
						$$renderer3.push(`<tr${attr_class(`divide-x divide-surface-200/50 dark:divide-surface-50 ${stringify('')} ${stringify('')}`)}>`);
						TableIcons($$renderer3, {
							checked: selectedMap[index] ?? false,
							onCheck: (checked) => {
								selectedMap[index] = checked;
							}
						});
						$$renderer3.push(`<!----><!--[-->`);
						const each_array_4 = ensure_array_like(displayTableHeaders.filter((header) => header.visible));
						for (let $$index_3 = 0, $$length2 = each_array_4.length; $$index_3 < $$length2; $$index_3++) {
							let header = each_array_4[$$index_3];
							$$renderer3.push(`<td class="text-center">`);
							if (header.key === 'blocked') {
								$$renderer3.push('<!--[-->');
								{
									$$renderer3.push('<!--[-->');
									$$renderer3.push(
										`<button class="btn-sm cursor-pointer rounded-md p-1 transition-all duration-200 hover:scale-105 hover:bg-surface-200 hover:shadow-md dark:hover:bg-surface-600"${attr('aria-label', row.blocked ? 'Click to unblock user' : 'Click to block user')}${attr('title', row.blocked ? 'Click to unblock user' : 'Click to block user')}>`
									);
									Boolean$1($$renderer3, { value: !!row[header.key] });
									$$renderer3.push(`<!----></button>`);
								}
								$$renderer3.push(`<!--]-->`);
							} else {
								$$renderer3.push('<!--[!-->');
								if (header.key === 'avatar') {
									$$renderer3.push('<!--[-->');
									Avatar($$renderer3, {
										class: 'size-10 overflow-hidden rounded-full border border-surface-200/50 dark:text-surface-50/50',
										children: ($$renderer4) => {
											$$renderer4.push(`<!---->`);
											Avatar.Image($$renderer4, {
												src:
													currentUser && isUser(row) && row._id === currentUser._id
														? normalizeMediaUrl(avatarSrc.value)
														: isUser(row) && header.key === 'avatar'
															? normalizeMediaUrl(row.avatar)
															: '/Default_User.svg',
												class: 'h-full w-full object-cover'
											});
											$$renderer4.push(`<!----> <!---->`);
											Avatar.Fallback($$renderer4, {
												children: ($$renderer5) => {
													$$renderer5.push(`<!---->User`);
												},
												$$slots: { default: true }
											});
											$$renderer4.push(`<!---->`);
										},
										$$slots: { default: true }
									});
								} else {
									$$renderer3.push('<!--[!-->');
									if (header.key === 'role') {
										$$renderer3.push('<!--[-->');
										Role($$renderer3, {
											value: isUser(row) && header.key === 'role' ? row.role : isToken(row) && header.key === 'role' ? (row.role ?? '') : '',
											roles
										});
									} else {
										$$renderer3.push('<!--[!-->');
										if (header.key === '_id') {
											$$renderer3.push('<!--[-->');
											$$renderer3.push(
												`<div class="flex items-center justify-center gap-2"><span class="font-mono text-sm">${escape_html(isUser(row) ? row._id : isToken(row) ? row._id : '-')}</span> <button class="preset-ghost btn-icon btn-icon-sm hover:preset-filled-tertiary-500 hover:dark:preset-filled-primary-500" aria-label="Copy User ID" title="Copy User ID to clipboard"><iconify-icon icon="oui:copy-clipboard" width="16"></iconify-icon></button></div>`
											);
										} else {
											$$renderer3.push('<!--[!-->');
											if (header.key === 'token') {
												$$renderer3.push('<!--[-->');
												$$renderer3.push(
													`<div class="flex items-center justify-center gap-2"><span class="max-w-[200px] truncate font-mono text-sm">${escape_html(isToken(row) && header.key === 'token' ? row.token : '-')}</span> <button class="preset-ghost btn-icon btn-icon-sm hover:preset-filled-tertiary-500 hover:dark:preset-filled-primary-500" aria-label="Copy Token" title="Copy Token to clipboard"><iconify-icon icon="oui:copy-clipboard" width="16"></iconify-icon></button></div>`
												);
											} else {
												$$renderer3.push('<!--[!-->');
												if (['createdAt', 'updatedAt', 'lastAccess', 'expires'].includes(header.key)) {
													$$renderer3.push('<!--[-->');
													const dateKey = header.key;
													const dateValue = isUser(row) ? row[dateKey] : isToken(row) ? row[dateKey] : void 0;
													$$renderer3.push(`${escape_html(formatDate(dateValue))}`);
												} else {
													$$renderer3.push('<!--[!-->');
													if (header.key === 'expires') {
														$$renderer3.push('<!--[-->');
														if (isToken(row) && header.key === 'expires' && row.expires) {
															$$renderer3.push('<!--[-->');
															const expiresVal = row.expires;
															const isTokenExpired =
																expiresVal !== null &&
																expiresVal !== void 0 &&
																(expiresVal instanceof Date ? expiresVal : new Date(String(expiresVal))) < /* @__PURE__ */ new Date();
															const remainingTime = getRemainingTime(expiresVal);
															$$renderer3.push(
																`<span${attr_class(clsx(isTokenExpired ? 'font-semibold text-error-500' : ''))}>${escape_html(remainingTime)} `
															);
															if (isTokenExpired) {
																$$renderer3.push('<!--[-->');
																$$renderer3.push(
																	`<iconify-icon icon="material-symbols:warning" class="ml-1 text-error-500" width="16"></iconify-icon>`
																);
															} else {
																$$renderer3.push('<!--[!-->');
															}
															$$renderer3.push(`<!--]--></span>`);
														} else {
															$$renderer3.push('<!--[!-->');
															$$renderer3.push(`-`);
														}
														$$renderer3.push(`<!--]-->`);
													} else {
														$$renderer3.push('<!--[!-->');
														const displayValue = isUser(row) ? String(row[header.key] ?? '-') : isToken(row) ? String(row[header.key] ?? '-') : '-';
														$$renderer3.push(`${html(displayValue)}`);
													}
													$$renderer3.push(`<!--]-->`);
												}
												$$renderer3.push(`<!--]-->`);
											}
											$$renderer3.push(`<!--]-->`);
										}
										$$renderer3.push(`<!--]-->`);
									}
									$$renderer3.push(`<!--]-->`);
								}
								$$renderer3.push(`<!--]-->`);
							}
							$$renderer3.push(`<!--]--></td>`);
						}
						$$renderer3.push(`<!--]--></tr>`);
					}
					$$renderer3.push(
						`<!--]--></tbody></table></div> <div class="mt-2 flex flex-col items-center justify-center px-2 md:flex-row md:justify-between md:p-4">`
					);
					TablePagination($$renderer3, {
						pagesCount,
						totalItems,
						rowsPerPageOptions: [2, 10, 25, 50, 100, 500],
						onUpdatePage: (page) => {
							currentPage = page;
						},
						onUpdateRowsPerPage: (rows) => {
							rowsPerPage = rows;
							currentPage = 1;
						},
						get currentPage() {
							return currentPage;
						},
						set currentPage($$value) {
							currentPage = $$value;
							$$settled = false;
						},
						get rowsPerPage() {
							return rowsPerPage;
						},
						set rowsPerPage($$value) {
							rowsPerPage = $$value;
							$$settled = false;
						}
					});
					$$renderer3.push(`<!----></div>`);
				} else {
					$$renderer3.push('<!--[!-->');
					$$renderer3.push(`<div class="preset-ghost-error-500 btn text-center font-bold">`);
					{
						$$renderer3.push('<!--[-->');
						$$renderer3.push(`${escape_html(adminarea_nouser())}`);
					}
					$$renderer3.push(`<!--]--></div>`);
				}
				$$renderer3.push(`<!--]-->`);
			}
			$$renderer3.push(`<!--]--></div>`);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer2.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer2.subsume($$inner_renderer);
	});
}
logger.info('Global search index initialized');
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { data } = $$props;
		const { user: serverUser, isFirstUser, isMultiTenant, is2FAEnabledGlobal } = data;
		const user = {
			_id: serverUser?._id ?? '',
			email: serverUser?.email ?? '',
			username: serverUser?.username ?? '',
			role: serverUser?.role ?? '',
			avatar: serverUser?.avatar ?? '/Default_User.svg',
			tenantId: serverUser?.tenantId ?? '',
			// Add tenantId
			is2FAEnabled: serverUser?.is2FAEnabled ?? false,
			permissions: []
		};
		let password = 'hash-password';
		function normalizeAvatarUrl(url) {
			if (!url) return '/Default_User.svg';
			if (url.startsWith('data:')) return url;
			let clean = url.replace(/^\/+/, '');
			clean = clean.replace(/^mediaFolder\//, '').replace(/^files\//, '');
			clean = clean.replace(/^\/+/, '');
			return `/files/${clean}?t=${Date.now()}`;
		}
		PageTitle($$renderer2, {
			name: userpage_title(),
			icon: 'mdi:account-circle',
			showBackButton: true,
			backUrl: '/config'
		});
		$$renderer2.push(
			`<!----> <div class="max-h-[calc(100vh-65px)] overflow-auto"><div class="wrapper mb-2"><div class="grid grid-cols-1 grid-rows-2 gap-1 overflow-hidden md:grid-cols-2 md:grid-rows-1"><div class="relative flex flex-col items-center justify-center gap-1"><div class="relative group">`
		);
		Avatar($$renderer2, {
			class: 'w-32 h-32 rounded-full border border-white shadow-lg dark:border-surface-800',
			children: ($$renderer3) => {
				$$renderer3.push(`<!---->`);
				Avatar.Image($$renderer3, {
					src: normalizeAvatarUrl(avatarSrc.value),
					class: 'object-cover'
				});
				$$renderer3.push(`<!----> <!---->`);
				Avatar.Fallback($$renderer3, {
					children: ($$renderer4) => {
						$$renderer4.push(`<!---->AV`);
					},
					$$slots: { default: true }
				});
				$$renderer3.push(`<!---->`);
			},
			$$slots: { default: true }
		});
		$$renderer2.push(
			`<!----> <button class="absolute bottom-0 right-0 p-2 rounded-full gradient-tertiary dark:gradient-primary btn-icon"${attr('title', userpage_editavatar())}><iconify-icon icon="mdi:pencil" width="18"></iconify-icon></button></div> <div class="gradient-secondary badge mt-1 w-full max-w-xs text-white">${escape_html(userpage_user_id())}<span class="ml-2">${escape_html(user?._id || 'N/A')}</span></div> <div class="gradient-tertiary badge w-full max-w-xs text-white">${escape_html(role())}<span class="ml-2">${escape_html(user?.role || 'N/A')}</span></div> `
		);
		if (is2FAEnabledGlobal) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<button class="btn preset-outlined btn-sm w-full max-w-xs"><div class="flex w-full items-center justify-between"><span>Two-Factor Auth</span> <div class="flex items-center gap-1"><iconify-icon${attr('icon', `mdi:${stringify(user?.is2FAEnabled ? 'shield-check' : 'shield-off')}`)} width="20"${attr_class(clsx(user?.is2FAEnabled ? 'text-primary-500' : 'text-error-500'))}></iconify-icon> <span class="text-xs">${escape_html(user?.is2FAEnabled ? 'Enabled' : 'Disabled')}</span></div></div></button>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		if (isMultiTenant) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="gradient-primary badge w-full max-w-xs text-white">Tenant ID:<span class="ml-2">${escape_html(user?.tenantId || 'N/A')}</span></div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> <!--[-->`);
		const each_array = ensure_array_like(user.permissions);
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let permission = each_array[$$index];
			$$renderer2.push(`<div class="gradient-primary badge mt-1 w-full max-w-xs text-white">${escape_html(permission)}</div>`);
		}
		$$renderer2.push(`<!--]--></div> `);
		if (user) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<form><label>${escape_html(username())}: <input${attr('value', user.username)} name="username" type="text" autocomplete="username" disabled class="input"/></label> <label>${escape_html(email())}: <input${attr('value', user.email)} name="email" type="email" autocomplete="email" disabled class="input"/></label> <label>${escape_html(form_password())}: <input${attr('value', password)} name="password" type="password" autocomplete="current-password" disabled class="input"/></label> <div class="mt-4 flex flex-col justify-between gap-2 sm:flex-row sm:gap-1"><button${attr('aria-label', userpage_edit_usersetting())}${attr_class(`gradient-tertiary btn w-full max-w-sm text-white ${stringify(isFirstUser ? '' : 'mx-auto md:mx-0')}`)}><iconify-icon icon="bi:pencil-fill" color="white" width="18" class="mr-1"></iconify-icon>${escape_html(userpage_edit_usersetting())}</button> `
			);
			if (isFirstUser) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<button${attr('aria-label', button_delete())} class="gradient-error btn w-full max-w-sm text-white"><iconify-icon icon="bi:trash3-fill" color="white" width="18" class="mr-1"></iconify-icon> ${escape_html(button_delete())}</button>`
				);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--></div></form>`);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div></div> `);
		PermissionGuard($$renderer2, {
			config: {
				name: 'Admin Area Access',
				contextId: 'config/adminArea',
				action: 'manage',
				contextType: 'system',
				description: 'Allows access to admin area for user management'
			},
			silent: true,
			children: ($$renderer3) => {
				$$renderer3.push(`<div class="wrapper2">`);
				AdminArea($$renderer3, { currentUser: { ...user }, roles: data.roles });
				$$renderer3.push(`<!----></div>`);
			}
		});
		$$renderer2.push(`<!----></div>`);
	});
}
export { _page as default };
//# sourceMappingURL=_page.svelte.js.map
