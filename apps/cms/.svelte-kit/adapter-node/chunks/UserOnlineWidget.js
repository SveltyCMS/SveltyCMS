import { d as escape_html, a as attr, e as ensure_array_like, c as stringify } from './index5.js';
import { B as BaseWidget } from './BaseWidget.js';
const widgetMeta = {
	name: 'Online Users',
	icon: 'mdi:account-multiple-outline',
	defaultSize: { w: 1, h: 2 }
};
function UserOnlineWidget($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let searchTerm = '';
		const {
			label = 'Online Users',
			theme = 'light',
			icon = 'mdi:account-multiple-outline',
			widgetId = void 0,
			size = { w: 1, h: 1 },
			onSizeChange = (_newSize) => {},
			onRemove = () => {}
		} = $$props;
		function getPlaceholderAvatar(name) {
			const initials = name
				.split(' ')
				.map((n) => n[0])
				.join('')
				.substring(0, 2)
				.toUpperCase();
			return `https://placehold.co/40x40/6366f1/e0e7ff?text=${initials}`;
		}
		function filterUsers(users, search) {
			if (!search.trim()) return users;
			const searchLower = search.toLowerCase();
			return users.filter((user) => user.name.toLowerCase().includes(searchLower));
		}
		{
			let children = function ($$renderer3, { data: fetchedData }) {
				if (fetchedData?.onlineUsers) {
					$$renderer3.push('<!--[-->');
					const filteredUsers = filterUsers(fetchedData.onlineUsers, searchTerm);
					$$renderer3.push(
						`<div class="flex h-full flex-col space-y-2"><div class="text-center text-sm"><span class="font-bold text-primary-500">${escape_html(fetchedData.onlineUsers.length)}</span> User(s) currently online.</div> `
					);
					if (fetchedData.onlineUsers.length > 0) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(
							`<div class="relative"><input type="text" placeholder="Search users..."${attr('value', searchTerm)} class="w-full rounded-md border border-surface-300 bg-surface-50 px-3 py-1.5 text-xs placeholder-surface-400 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 dark:border-surface-600 dark:bg-surface-700 dark:text-surface-200 dark:placeholder-surface-500"/> <iconify-icon icon="mdi:magnify" class="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 dark:text-surface-500" width="14"></iconify-icon></div>`
						);
					} else {
						$$renderer3.push('<!--[!-->');
					}
					$$renderer3.push(`<!--]--> <div class="grow space-y-1 overflow-y-auto" style="max-height: 180px;">`);
					if (filteredUsers.length > 0) {
						$$renderer3.push('<!--[-->');
						$$renderer3.push(`<!--[-->`);
						const each_array = ensure_array_like(filteredUsers);
						for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
							let user = each_array[$$index];
							$$renderer3.push(
								`<div class="flex items-center justify-between gap-2 rounded-lg p-2 hover:bg-surface-50 dark:hover:bg-surface-700"><div class="flex min-w-0 flex-1 items-center gap-2"><img${attr('src', user.avatarUrl || getPlaceholderAvatar(user.name))}${attr('alt', `${stringify(user.name)}'s avatar`)} class="h-7 w-7 shrink-0 rounded-full bg-surface-200 dark:bg-surface-700"/> <span class="truncate text-sm font-medium text-surface-800 dark:text-surface-200">${escape_html(user.name)}</span></div> <span class="shrink-0 text-xs text-surface-500 dark:text-surface-50">${escape_html(user.onlineTime || 'N/A')}</span></div>`
							);
						}
						$$renderer3.push(`<!--]-->`);
					} else {
						$$renderer3.push('<!--[!-->');
						{
							$$renderer3.push('<!--[!-->');
							$$renderer3.push(`<div class="flex h-full items-center justify-center text-sm text-surface-500">No users are currently active.</div>`);
						}
						$$renderer3.push(`<!--]-->`);
					}
					$$renderer3.push(`<!--]--></div></div>`);
				} else {
					$$renderer3.push('<!--[!-->');
					$$renderer3.push(`<div class="flex h-full items-center justify-center text-sm text-surface-500">Loading online users...</div>`);
				}
				$$renderer3.push(`<!--]-->`);
			};
			BaseWidget($$renderer2, {
				label,
				theme,
				endpoint: '/api/dashboard/online_user',
				pollInterval: 6e4,
				icon,
				widgetId,
				size,
				onSizeChange,
				onCloseRequest: onRemove,
				children
			});
		}
	});
}
export { UserOnlineWidget as default, widgetMeta };
//# sourceMappingURL=UserOnlineWidget.js.map
