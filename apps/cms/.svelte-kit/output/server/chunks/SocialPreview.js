import { e as ensure_array_like, g as attr_class, a as attr, c as stringify, d as escape_html } from './index5.js';
function SocialPreview($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { ogTitle = '', ogDescription = '', ogImage = '', twitterTitle = '', twitterDescription = '', twitterImage = '', hostUrl = '' } = $$props;
		let activePlatform = 'facebook';
		let displayTitle = ogTitle || 'Page Title';
		let displayDescription = ogDescription || 'Page description...';
		let displayImage = ogImage;
		const platforms = [
			{
				id: 'facebook',
				icon: 'mdi:facebook',
				color: 'text-blue-600',
				label: 'Facebook'
			},
			{
				id: 'whatsapp',
				icon: 'mdi:whatsapp',
				color: 'text-green-500',
				label: 'WhatsApp'
			},
			{
				id: 'twitter',
				icon: 'mdi:twitter',
				color: 'text-black dark:text-white',
				label: 'X (Twitter)'
			},
			{
				id: 'linkedin',
				icon: 'mdi:linkedin',
				color: 'text-blue-700',
				label: 'LinkedIn'
			},
			{
				id: 'discord',
				icon: 'ic:baseline-discord',
				color: 'text-indigo-500',
				label: 'Discord'
			}
		];
		$$renderer2.push(
			`<div class="card preset-tonal-surface p-4 rounded-container-token mb-6"><div class="flex items-center gap-2 mb-4"><iconify-icon icon="mdi:share-variant" class="text-secondary-500 text-xl"></iconify-icon> <h3 class="h3">Social Share Preview</h3></div> <div class="flex items-center gap-2 mb-6 overflow-x-auto pb-2"><!--[-->`
		);
		const each_array = ensure_array_like(platforms);
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let platform = each_array[$$index];
			$$renderer2.push(
				`<button type="button"${attr_class(`btn btn-icon btn-icon-sm transition-all ${stringify(activePlatform === platform.id ? 'variant-filled-secondary ring-2 ring-surface-900 dark:ring-white scale-110' : 'preset-tonal-surface hover:preset-filled-surface-500')}`)}${attr('title', platform.label)}><iconify-icon${attr('icon', platform.icon)}${attr_class(`text-xl ${stringify(activePlatform === platform.id ? 'text-white' : platform.color)}`)}></iconify-icon></button>`
			);
		}
		$$renderer2.push(
			`<!--]--></div> <div class="bg-surface-50 dark:bg-surface-900 rounded-lg p-4 md:p-8 flex justify-center border border-surface-200 dark:text-surface-50"><div class="w-full max-w-[500px] bg-white text-black overflow-hidden shadow-lg rounded-lg transition-all duration-300"><div class="relative bg-gray-100 aspect-[1.91/1] flex items-center justify-center overflow-hidden">`
		);
		if (displayImage) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<img${attr('src', displayImage)} alt="Social Preview" class="w-full h-full object-cover"/>`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(
				`<div class="flex flex-col items-center text-gray-400"><iconify-icon icon="mdi:image-off" class="text-4xl"></iconify-icon> <span class="text-xs uppercase font-bold mt-2 tracking-wider">No Image</span></div>`
			);
		}
		$$renderer2.push(
			`<!--]--></div> <div class="p-3 bg-[#f0f2f5] border-t border-gray-200"><div class="text-[12px] uppercase text-gray-500 truncate font-sans mb-0.5">${escape_html(
				hostUrl
					.replace(/^https?:\/\//, '')
					.split('/')[0]
					.toUpperCase()
			)}</div> <div class="font-bold text-[16px] leading-snug text-[#050505] line-clamp-2 md:line-clamp-1 font-sans mb-1">${escape_html(displayTitle)}</div> <div class="text-[14px] text-[#65676b] line-clamp-1 md:line-clamp-2 font-sans">${escape_html(displayDescription)}</div></div></div></div> <div class="mt-4 text-sm text-surface-600 dark:text-surface-300">`
		);
		if (displayTitle.length > 95 && activePlatform === 'facebook') {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="flex items-center gap-2 text-warning-600"><iconify-icon icon="mdi:alert"></iconify-icon> <span>Title is slightly long for Facebook (recommended &lt; 95 chars).</span></div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		if (displayTitle.length > 70 && activePlatform === 'twitter');
		else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		if (!displayImage) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="flex items-center gap-2 text-warning-600 mt-1"><iconify-icon icon="mdi:image-search"></iconify-icon> <span>No Og Image selected. The platform will try to scrape one from your page body.</span></div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div></div>`);
	});
}
export { SocialPreview as default };
//# sourceMappingURL=SocialPreview.js.map
