import { e as ensure_array_like, d as escape_html, a as attr } from '../../../../chunks/index5.js';
import { d as dateToISODateString } from '../../../../chunks/dateUtils.js';
import '../../../../chunks/logger.js';
import { w as marketplace } from '../../../../chunks/_index.js';
import { P as PageTitle } from '../../../../chunks/PageTitle.js';
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let selectedTheme = null;
		let customThemes = [];
		loadCustomThemes();
		async function loadCustomThemes() {
			const customThemesFiles = /* @__PURE__ */ Object.assign({});
			customThemes = Object.entries(customThemesFiles).map(([key, value], index) => {
				const nowIso = dateToISODateString(/* @__PURE__ */ new Date());
				return {
					_id: `custom-theme-${index}`,
					name: key.split('/')[3],
					path: value,
					isDefault: false,
					isActive: false,
					config: { tailwindConfigPath: '', assetsPath: '' },
					createdAt: nowIso,
					updatedAt: nowIso
				};
			});
		}
		const themes = [
			{
				_id: 'default-theme',
				name: 'SveltyCMSTheme',
				path: '/path/to/default/theme.css',
				isDefault: true,
				isActive: true,
				config: { tailwindConfigPath: '', assetsPath: '' },
				createdAt: dateToISODateString(/* @__PURE__ */ new Date()),
				updatedAt: dateToISODateString(/* @__PURE__ */ new Date())
			},
			...customThemes
		];
		function handleThemeChange() {}
		PageTitle($$renderer2, {
			name: 'Theme Management',
			icon: 'ph:layout',
			showBackButton: true,
			backUrl: '/config'
		});
		$$renderer2.push(`<!----> <div class="mb-4"><label for="theme-select" class="mb-2 block font-bold">Current System Theme:</label> `);
		$$renderer2.select(
			{
				id: 'theme-select',
				value: selectedTheme,
				class: 'select',
				onchange: handleThemeChange
			},
			($$renderer3) => {
				$$renderer3.push(`<!--[-->`);
				const each_array = ensure_array_like(themes);
				for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
					let theme = each_array[$$index];
					$$renderer3.option({ value: theme }, ($$renderer4) => {
						$$renderer4.push(`${escape_html(theme.name)}`);
					});
				}
				$$renderer3.push(`<!--]-->`);
			}
		);
		$$renderer2.push(`</div> <div class="mt-4"><h3 class="font-bold">Available Themes:</h3> <!--[-->`);
		const each_array_1 = ensure_array_like(customThemes);
		for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
			let theme = each_array_1[$$index_1];
			$$renderer2.push(`<button class="preset-outline-tertiary-500 btn mt-2">Preview ${escape_html(theme.name)}</button>`);
		}
		$$renderer2.push(`<!--]--></div> `);
		if (customThemes.length === 0) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<p class="my-2 text-center text-tertiary-500 dark:text-primary-500 sm:text-left">There are currently no custom themes available. Visit the SveltyCMS marketplace to find new themes.</p> <a href="https://www.sveltyCMS.com" target="_blank" rel="noopener noreferrer"${attr('aria-label', marketplace())} class="preset-outlined-primary-500 btn w-full gap-2 py-6"><iconify-icon icon="icon-park-outline:shopping-bag" width="28" class="text-white"></iconify-icon> <p class="uppercase">${escape_html(marketplace())}</p></a>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]-->`);
	});
}
export { _page as default };
//# sourceMappingURL=_page.svelte.js.map
