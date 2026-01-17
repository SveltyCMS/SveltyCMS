import { a as attr, d as escape_html, e as ensure_array_like, g as attr_class, c as stringify, i as clsx } from '../../../../chunks/index5.js';
import { p as page } from '../../../../chunks/index6.js';
import '../../../../chunks/store.svelte.js';
import '../../../../chunks/logger.js';
import { g as globalLoadingStore, l as loadingOperations } from '../../../../chunks/loadingStore.svelte.js';
import { P as PageTitle } from '../../../../chunks/PageTitle.js';
import '../../../../chunks/runtime.js';
import '../../../../chunks/index7.js';
import '../../../../chunks/client.js';
import { P as PermissionType } from '../../../../chunks/types.js';
import { T as TablePagination } from '../../../../chunks/TablePagination.js';
import { T as TableFilter } from '../../../../chunks/TableFilter.js';
import { am as system_permission, an as system_roles } from '../../../../chunks/_index.js';
import { T as Tabs } from '../../../../chunks/anatomy3.js';
function Roles($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let roles = [];
		let selectedRoles = /* @__PURE__ */ new Set();
		let items = [];
		{
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(
				`<h3 class="mb-2 text-center text-xl font-bold">Roles Management:</h3> <p class="mb-4 justify-center text-center text-sm text-gray-500 dark:text-gray-400">Manage user roles and their access permissions. You can create, edit, or delete roles and assign specific permissions to them.</p> <div class="wrapper my-4"><div class="mb-4 flex items-center justify-between"><button class="preset-filled-primary-500 btn">Create Role</button> <button class="preset-filled-error-500 btn"${attr('disabled', selectedRoles.size === 0, true)}>Delete Roles (${escape_html(selectedRoles.size)})</button></div> <div class="role mt-4 flex-1 overflow-auto svelte-xnjn9r">`
			);
			if (roles.length === 0) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`<p>No roles defined yet.</p>`);
			} else {
				$$renderer2.push('<!--[!-->');
				$$renderer2.push(`<div class="rounded-8"><section class="list-none space-y-2"><!--[-->`);
				const each_array = ensure_array_like(items);
				for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
					let role = each_array[$$index];
					$$renderer2.push(
						`<div class="animate-flip flex items-center justify-between rounded border p-2 hover:bg-surface-500 md:flex-row"><div class="flex items-center gap-2"><iconify-icon icon="mdi:drag" width="18" class="cursor-move text-gray-500 dark:text-gray-300"></iconify-icon> `
					);
					if (!role.isAdmin) {
						$$renderer2.push('<!--[-->');
						$$renderer2.push(`<input type="checkbox"${attr('checked', selectedRoles.has(role._id), true)} class="mr-2"/>`);
					} else {
						$$renderer2.push('<!--[!-->');
					}
					$$renderer2.push(
						`<!--]--> <span class="flex items-center text-xl font-semibold text-tertiary-500 dark:text-primary-500">${escape_html(role.name)} `
					);
					if (role.description) {
						$$renderer2.push('<!--[-->');
						$$renderer2.push(
							`<iconify-icon icon="material-symbols:info" width="18" class="ml-1 text-tertiary-500 dark:text-primary-500"${attr('title', role.description)}></iconify-icon>`
						);
					} else {
						$$renderer2.push('<!--[!-->');
					}
					$$renderer2.push(
						`<!--]--></span></div> <p class="mt-2 hidden text-sm text-gray-600 dark:text-gray-400 md:ml-4 md:mt-0 md:block">${escape_html(role.description)}</p> <button aria-label="Edit role" class="preset-filled-secondary-500 btn"><iconify-icon icon="mdi:pencil" class="text-white" width="18"></iconify-icon> <span class="hidden md:block">Edit</span></button></div>`
					);
				}
				$$renderer2.push(`<!--]--></section></div>`);
			}
			$$renderer2.push(`<!--]--></div></div>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function Permissions($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let permissionsList = [];
		let roles = [];
		let searchTerm = '';
		const getGroups = (filteredPermissions2) => {
			const groups2 = [];
			filteredPermissions2.forEach((cur) => {
				let group = '';
				if (cur.type === PermissionType.COLLECTION) {
					group = 'Collection Entries';
				} else if (cur.type === PermissionType.USER) {
					group = 'User Management';
				} else if (cur.type === PermissionType.CONFIGURATION) {
					group = 'Configuration';
				} else if (cur.type === PermissionType.SYSTEM) {
					const prefix = cur._id.split(':')[0];
					if (prefix === 'system') {
						group = 'System';
					} else if (prefix === 'api') {
						group = 'API Access';
					} else if (prefix === 'content') {
						group = 'Content Management';
					} else if (prefix === 'media') {
						group = 'Media Management';
					} else if (prefix === 'config') {
						group = 'Configuration';
					} else if (prefix === 'admin') {
						group = 'Admin';
					} else {
						group = 'System';
					}
				}
				if (group && !groups2.includes(group)) {
					groups2.push(group);
				}
			});
			return groups2;
		};
		const sortPermissions = (permissions) => {
			return permissions;
		};
		const filteredPermissions = permissionsList.filter((permission) => permission._id?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
		const groups = getGroups(filteredPermissions);
		const adminRole = roles.find((role) => role.isAdmin);
		const nonAdminRolesCount = roles.filter((role) => !role.isAdmin).length;
		const filterGroups = (permissions, group) => {
			let filtered = [];
			if (group === 'Collection Entries') {
				filtered = permissions.filter((cur) => cur.type === PermissionType.COLLECTION);
			} else if (group === 'User Management') {
				filtered = permissions.filter((cur) => cur.type === PermissionType.USER);
			} else if (group === 'Configuration') {
				filtered = permissions.filter(
					(cur) => cur.type === PermissionType.CONFIGURATION || (cur.type === PermissionType.SYSTEM && cur._id.startsWith('config:'))
				);
			} else if (group === 'System') {
				filtered = permissions.filter((cur) => cur.type === PermissionType.SYSTEM && cur._id.startsWith('system:'));
			} else if (group === 'API Access') {
				filtered = permissions.filter((cur) => cur.type === PermissionType.SYSTEM && cur._id.startsWith('api:'));
			} else if (group === 'Content Management') {
				filtered = permissions.filter((cur) => cur.type === PermissionType.SYSTEM && cur._id.startsWith('content:'));
			} else if (group === 'Media Management') {
				filtered = permissions.filter((cur) => cur.type === PermissionType.SYSTEM && cur._id.startsWith('media:'));
			} else if (group === 'Admin') {
				filtered = permissions.filter((cur) => cur.type === PermissionType.SYSTEM && cur._id.startsWith('admin:'));
			} else {
				filtered = permissions.filter((cur) => cur._id.split(':')[0] === group.toLowerCase());
			}
			return sortPermissions(filtered);
		};
		{
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(
				`<h3 class="mb-2 text-center text-xl font-bold">Permission Management:</h3> <p class="mb-4 justify-center text-center text-sm text-gray-500 dark:text-gray-400">Select the roles for each permission and click 'Save' to apply your changes.</p> <div class="sticky top-0 z-10 mb-4 flex items-center justify-between"><input type="text"${attr('value', searchTerm)} placeholder="Search Permissions..." class="input mr-4 grow" aria-label="Search permissions"/></div> `
			);
			if (filteredPermissions.length === 0) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`<p class="text-tertiary-500 dark:text-primary-500">${escape_html('No permissions defined yet.')}</p>`);
			} else {
				$$renderer2.push('<!--[!-->');
				if (adminRole) {
					$$renderer2.push('<!--[-->');
					$$renderer2.push(
						`<p class="mb-2 w-full overflow-auto text-nowrap text-center">* <span class="text-tertiary-500 dark:text-primary-500">${escape_html(adminRole.name)}</span> Role has all permissions</p>`
					);
				} else {
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(
					`<!--]--> <div class="permission overflow-auto svelte-v46j2e"><table class="compact w-full table-auto border"><thead class="sticky top-0 border bg-surface-800"><tr class="divide-x text-tertiary-500 dark:text-primary-500"><th${attr_class(
						`cursor-pointer select-none py-2 ${stringify('font-semibold text-primary-500 dark:text-secondary-400')}`
					)} title="Click to sort by permission name"><div class="flex items-center justify-center">Type `
				);
				{
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(
					`<!--]--></div></th><th${attr_class(`cursor-pointer select-none py-2 ${stringify('')}`)} title="Click to sort by action"><div class="flex items-center justify-center">Action `
				);
				{
					$$renderer2.push('<!--[!-->');
				}
				$$renderer2.push(`<!--]--></div></th><!--[-->`);
				const each_array = ensure_array_like(roles);
				for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
					let role = each_array[$$index];
					if (!role.isAdmin) {
						$$renderer2.push('<!--[-->');
						$$renderer2.push(`<th class="py-2">${escape_html(role.name)}</th>`);
					} else {
						$$renderer2.push('<!--[!-->');
					}
					$$renderer2.push(`<!--]-->`);
				}
				$$renderer2.push(`<!--]--></tr></thead><tbody><!--[-->`);
				const each_array_1 = ensure_array_like(groups);
				for (let $$index_3 = 0, $$length = each_array_1.length; $$index_3 < $$length; $$index_3++) {
					let group = each_array_1[$$index_3];
					if (filterGroups(filteredPermissions, group).length > 0) {
						$$renderer2.push('<!--[-->');
						$$renderer2.push(
							`<tr><td${attr('colspan', nonAdminRolesCount + 2)} class="border-b bg-surface-500 px-1 py-2 font-semibold text-tertiary-500 dark:text-primary-500 lg:text-left">${escape_html(group)}:</td></tr> <!--[-->`
						);
						const each_array_2 = ensure_array_like(filterGroups(filteredPermissions, group));
						for (let $$index_2 = 0, $$length2 = each_array_2.length; $$index_2 < $$length2; $$index_2++) {
							let permission = each_array_2[$$index_2];
							$$renderer2.push(
								`<tr class="divide-x border-b text-center hover:bg-surface-50 dark:hover:bg-surface-600"><td class="px-1 py-1 md:text-left">${escape_html(permission.name)}</td><td class="px-1 py-1">${escape_html(permission.action)}</td><!--[-->`
							);
							const each_array_3 = ensure_array_like(roles);
							for (let $$index_1 = 0, $$length3 = each_array_3.length; $$index_1 < $$length3; $$index_1++) {
								let role = each_array_3[$$index_1];
								if (!role.isAdmin) {
									$$renderer2.push('<!--[-->');
									$$renderer2.push(
										`<td class="px-1 py-1"><input type="checkbox"${attr('checked', role.permissions.includes(permission._id), true)} class="form-checkbox"/></td>`
									);
								} else {
									$$renderer2.push('<!--[!-->');
								}
								$$renderer2.push(`<!--]-->`);
							}
							$$renderer2.push(`<!--]--></tr>`);
						}
						$$renderer2.push(`<!--]-->`);
					} else {
						$$renderer2.push('<!--[!-->');
					}
					$$renderer2.push(`<!--]-->`);
				}
				$$renderer2.push(`<!--]--></tbody></table></div>`);
			}
			$$renderer2.push(`<!--]-->`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function AdminRole($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { roleData } = $$props;
		let currentAdminRole = null;
		let currentAdminName = null;
		let isSaving = false;
		let selectedAdminRole = null;
		const availableRoles = roleData.filter((role) => role._id !== currentAdminRole);
		const hasChanges = selectedAdminRole !== currentAdminRole;
		const handleRoleChange = (event) => {
			const selectedRoleId = event.target.value;
			selectedAdminRole = selectedRoleId;
		};
		{
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(
				`<h3 class="mb-2 text-center text-xl font-bold">Admin Role Management:</h3> <p class="mb-4 justify-center text-center text-sm text-gray-500 dark:text-gray-400">Please select a new role for the administrator from the dropdown below. Your changes will take effect after you click "Save Changes".</p> <div class="wrapper my-4"><p class="my-4 text-center lg:text-left">Current Admin Role: <span class="ml-2 text-tertiary-500 dark:text-primary-500">${escape_html(currentAdminName)}</span></p> <label for="adminRole" class="block text-sm text-surface-300">Select new Administrator Role:</label> `
			);
			$$renderer2.select(
				{
					id: 'adminRole',
					class: 'input',
					onchange: handleRoleChange,
					value: selectedAdminRole
				},
				($$renderer3) => {
					$$renderer3.push(`<!--[-->`);
					const each_array = ensure_array_like(availableRoles);
					for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
						let role = each_array[$$index];
						$$renderer3.option({ value: role._id }, ($$renderer4) => {
							$$renderer4.push(`${escape_html(role.name)}`);
						});
					}
					$$renderer3.push(`<!--]-->`);
				}
			);
			$$renderer2.push(` `);
			if (hasChanges) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(
					`<p class="mt-4 text-center lg:text-left">Selected Admin Role ID: <span class="ml-2 text-tertiary-500 dark:text-primary-500">${escape_html(selectedAdminRole)}</span></p> <div class="mt-4 flex justify-between"><button class="variant-filled-secondary btn">Cancel</button> <button class="preset-filled-tertiary-500 btn"${attr('disabled', isSaving, true)}>`
				);
				{
					$$renderer2.push('<!--[!-->');
					$$renderer2.push(`Save Changes`);
				}
				$$renderer2.push(`<!--]--></button></div>`);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--> `);
			{
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--></div>`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
function WebsiteTokens($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let tokens = [];
		let users = [];
		const userMap = new Map(users.map((u) => [u._id, u.username || u.email]));
		let newTokenName = '';
		let globalSearchValue = '';
		let searchShow = false;
		let filterShow = false;
		let columnShow = false;
		let density = 'normal';
		let sorting = { sortedBy: 'createdAt', isSorted: -1 };
		let currentPage = 1;
		let rowsPerPage = 10;
		let totalItems = 0;
		const pagesCount = Math.ceil(totalItems / rowsPerPage) || 1;
		const tableHeaders = [
			{ label: 'Name', key: 'name' },
			{ label: 'Token', key: 'token' },
			{ label: 'Created At', key: 'createdAt' },
			{ label: 'Created By', key: 'createdBy' }
		];
		let displayTableHeaders = tableHeaders.map((h) => ({ ...h, visible: true, id: `header-${h.key}` }));
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer3) {
			$$renderer3.push(
				`<div class="p-4"><h3 class="mb-2 text-center text-xl font-bold">Website Access Tokens</h3> <p class="mb-4 justify-center text-center text-sm text-gray-500 dark:text-gray-400">Manage API tokens for external websites to access your content.</p> <div class="card mb-4"><div class="p-4"><h4 class="h4 mb-2 font-bold text-tertiary-500 dark:text-primary-500">Generate New Website Token</h4> <div class="flex gap-2"><input type="text" class="input" placeholder="Token Name"${attr('value', newTokenName)}/> <button class="preset-filled-primary-500 btn">Generate</button></div></div></div> <div class="card"><div class="p-4"><div class="my-4 flex flex-wrap items-center justify-between gap-1"><h4 class="h4 font-bold text-tertiary-500 dark:text-primary-500">Existing Tokens</h4> <div class="order-3 sm:order-2">`
			);
			TableFilter($$renderer3, {
				globalSearchValue,
				searchShow,
				filterShow,
				columnShow,
				density
			});
			$$renderer3.push(`<!----></div></div> `);
			{
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(`<!--]--> <div class="table-container"><table class="table"><thead>`);
			{
				$$renderer3.push('<!--[!-->');
			}
			$$renderer3.push(`<!--]--><tr class="divide-x divide-preset-400 border-b border-black dark:border-white"><!--[-->`);
			const each_array_2 = ensure_array_like(displayTableHeaders.filter((h) => h.visible));
			for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
				let header = each_array_2[$$index_2];
				$$renderer3.push(
					`<th><div class="text-terriary-500 flex items-center justify-center text-center dark:text-primary-500">${escape_html(header.label)} <iconify-icon icon="material-symbols:arrow-upward-rounded" width="22"${attr_class(
						'origin-center duration-300 ease-in-out',
						void 0,
						{
							up: sorting.isSorted === 1,
							invisible: sorting.sortedBy !== header.key
						}
					)}></iconify-icon></div></th>`
				);
			}
			$$renderer3.push(`<!--]--><th class="text-terriary-500 text-center dark:text-primary-500">Action</th></tr></thead><tbody><!--[-->`);
			const each_array_3 = ensure_array_like(tokens);
			for (let $$index_4 = 0, $$length = each_array_3.length; $$index_4 < $$length; $$index_4++) {
				let token = each_array_3[$$index_4];
				$$renderer3.push(`<tr><!--[-->`);
				const each_array_4 = ensure_array_like(displayTableHeaders.filter((h) => h.visible));
				for (let $$index_3 = 0, $$length2 = each_array_4.length; $$index_3 < $$length2; $$index_3++) {
					let header = each_array_4[$$index_3];
					$$renderer3.push(`<td>`);
					if (header.key === 'token') {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<div class="flex items-center gap-2"><code>${escape_html(token.token)}</code> <button class="preset-outline-surface-500 btn-icon btn-icon-sm" aria-label="Copy token to clipboard"><iconify-icon icon="mdi:clipboard-outline" width="16"></iconify-icon></button></div>`
						);
					} else {
						$$renderer3.push('<!--[!-->');
						if (header.key === 'createdAt') {
							$$renderer3.push('<!--[-->');
							$$renderer3.push(`${escape_html(new Date(token.createdAt).toLocaleDateString())}`);
						} else {
							$$renderer3.push('<!--[!-->');
							if (header.key === 'createdBy') {
								$$renderer3.push('<!--[-->');
								$$renderer3.push(`${escape_html(userMap.get(token.createdBy) || token.createdBy)}`);
							} else {
								$$renderer3.push('<!--[!-->');
								$$renderer3.push(`${escape_html(token[header.key])}`);
							}
							$$renderer3.push(`<!--]-->`);
						}
						$$renderer3.push(`<!--]-->`);
					}
					$$renderer3.push(`<!--]--></td>`);
				}
				$$renderer3.push(`<!--]--><td><button class="preset-filled-error-500 btn-sm">Delete</button></td></tr>`);
			}
			$$renderer3.push(
				`<!--]--></tbody></table></div> <div class="flex justify-center"><div class="mt-2 flex flex-col items-center justify-center px-2 md:flex-row md:justify-between md:p-4">`
			);
			TablePagination($$renderer3, {
				pagesCount,
				totalItems,
				onUpdatePage: (page2) => (currentPage = page2),
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
			$$renderer3.push(`<!----></div></div></div></div></div>`);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer2.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer2.subsume($$inner_renderer);
	});
}
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let currentTab = '0';
		let rolesData = page.data.roles;
		let modifiedCount = 0;
		$$renderer2.push(`<div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">`);
		PageTitle($$renderer2, {
			name: 'Access Management',
			icon: 'mdi:account-key',
			showBackButton: true,
			backUrl: '/config'
		});
		$$renderer2.push(
			`<!----> <div class="mt-2 flex items-center justify-center gap-4 lg:mt-0 lg:justify-end"><button aria-label="Save all changes" class="preset-filled-tertiary-500 btn"${attr('disabled', true, true)}>`
		);
		if (globalLoadingStore.isLoadingReason(loadingOperations.configSave)) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`Saving...`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`Save (${escape_html(modifiedCount)})`);
		}
		$$renderer2.push(`<!--]--></button> <button aria-label="Reset changes" class="preset-filled-secondary-500 btn"${attr('disabled', true, true)}>Reset</button></div></div> <div class="mb-6 text-center sm:text-left"><p class="text-center text-tertiary-500 dark:text-primary-500">Here you can create and manage user roles and permissions. Each role defines a set of permissions that determine what actions users with that role
		can perform in the system.</p></div> <div class="flex flex-col">`);
		Tabs($$renderer2, {
			value: currentTab,
			onValueChange: (e) => (currentTab = e.value),
			class: 'grow',
			children: ($$renderer3) => {
				$$renderer3.push(`<!---->`);
				Tabs.List($$renderer3, {
					class: 'flex justify-around text-tertiary-500 dark:text-primary-500 border-b border-surface-200-800',
					children: ($$renderer4) => {
						$$renderer4.push(`<!---->`);
						Tabs.Trigger($$renderer4, {
							value: '0',
							class: 'flex-1',
							children: ($$renderer5) => {
								$$renderer5.push(
									`<div class="flex items-center justify-center gap-1 py-4"><iconify-icon icon="mdi:shield-lock-outline" width="28" class="text-black dark:text-white"></iconify-icon> <span${attr_class(clsx(currentTab === '0' ? 'text-secondary-500 dark:text-tertiary-500 font-bold' : ''))}>${escape_html(system_permission())}</span></div>`
								);
							},
							$$slots: { default: true }
						});
						$$renderer4.push(`<!----> <!---->`);
						Tabs.Trigger($$renderer4, {
							value: '1',
							class: 'flex-1',
							children: ($$renderer5) => {
								$$renderer5.push(
									`<div class="flex items-center justify-center gap-1 py-4"><iconify-icon icon="mdi:account-group" width="28" class="text-black dark:text-white"></iconify-icon> <span${attr_class(clsx(currentTab === '1' ? 'text-secondary-500 dark:text-tertiary-500 font-bold' : ''))}>${escape_html(system_roles())}</span></div>`
								);
							},
							$$slots: { default: true }
						});
						$$renderer4.push(`<!----> <!---->`);
						Tabs.Trigger($$renderer4, {
							value: '2',
							class: 'flex-1',
							children: ($$renderer5) => {
								$$renderer5.push(
									`<div class="flex items-center justify-center gap-1 py-4"><iconify-icon icon="mdi:account-cog" width="28" class="text-black dark:text-white"></iconify-icon> <span${attr_class(clsx(currentTab === '2' ? 'text-secondary-500 dark:text-tertiary-500 font-bold' : ''))}>Admin</span></div>`
								);
							},
							$$slots: { default: true }
						});
						$$renderer4.push(`<!----> <!---->`);
						Tabs.Trigger($$renderer4, {
							value: '3',
							class: 'flex-1',
							children: ($$renderer5) => {
								$$renderer5.push(
									`<div class="flex items-center justify-center gap-1 py-4"><iconify-icon icon="mdi:web" width="28" class="text-black dark:text-white"></iconify-icon> <span${attr_class(clsx(currentTab === '3' ? 'text-secondary-500 dark:text-tertiary-500 font-bold' : ''))}>Website Tokens</span></div>`
								);
							},
							$$slots: { default: true }
						});
						$$renderer4.push(`<!---->`);
					},
					$$slots: { default: true }
				});
				$$renderer3.push(`<!----> <!---->`);
				Tabs.Content($$renderer3, {
					value: '0',
					children: ($$renderer4) => {
						$$renderer4.push(`<div class="p-4">`);
						Permissions($$renderer4);
						$$renderer4.push(`<!----></div>`);
					},
					$$slots: { default: true }
				});
				$$renderer3.push(`<!----> <!---->`);
				Tabs.Content($$renderer3, {
					value: '1',
					children: ($$renderer4) => {
						$$renderer4.push(`<div class="p-4">`);
						Roles($$renderer4);
						$$renderer4.push(`<!----></div>`);
					},
					$$slots: { default: true }
				});
				$$renderer3.push(`<!----> <!---->`);
				Tabs.Content($$renderer3, {
					value: '2',
					children: ($$renderer4) => {
						$$renderer4.push(`<div class="p-4">`);
						AdminRole($$renderer4, { roleData: rolesData });
						$$renderer4.push(`<!----></div>`);
					},
					$$slots: { default: true }
				});
				$$renderer3.push(`<!----> <!---->`);
				Tabs.Content($$renderer3, {
					value: '3',
					children: ($$renderer4) => {
						$$renderer4.push(`<div class="p-4">`);
						WebsiteTokens($$renderer4);
						$$renderer4.push(`<!----></div>`);
					},
					$$slots: { default: true }
				});
				$$renderer3.push(`<!---->`);
			},
			$$slots: { default: true }
		});
		$$renderer2.push(`<!----></div>`);
	});
}
export { _page as default };
//# sourceMappingURL=_page.svelte.js.map
