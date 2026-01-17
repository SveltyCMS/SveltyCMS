import { g as attr_class, a as attr, d as escape_html } from './index5.js';
import { logger } from './logger.js';
import { d as debounce } from './utils.js';
function Input($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		let { field, value, error } = $$props;
		let urlInput = '';
		let fetchedMetadata = null;
		let isLoading = false;
		let fetchError = null;
		const ALLOWED_PLATFORMS = {
			youtube: /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
			vimeo: /^https?:\/\/(www\.)?vimeo\.com\/\d+$/,
			twitch: /^https?:\/\/(www\.)?twitch\.tv\/videos\/\d+$/,
			tiktok: /^https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+$/
		};
		function validateVideoUrl(url) {
			const rawPlatforms = field.allowedPlatforms || ['youtube', 'vimeo', 'twitch', 'tiktok'];
			const allowedPlatforms = Array.isArray(rawPlatforms)
				? rawPlatforms
				: typeof rawPlatforms === 'string'
					? rawPlatforms.split(',').map((p) => p.trim())
					: [];
			const isValid = allowedPlatforms.some((platform) => ALLOWED_PLATFORMS[platform]?.test(url));
			if (!isValid) {
				return {
					valid: false,
					error: `Invalid or disallowed video URL. Allowed platforms: ${allowedPlatforms.join(', ')}`
				};
			}
			return { valid: true };
		}
		debounce.create((...args) => {
			const url = typeof args[0] === 'string' ? args[0] : '';
			isLoading = true;
			fetchError = null;
			fetchedMetadata = null;
			if (!url) {
				isLoading = false;
				return;
			}
			const validation = validateVideoUrl(url);
			if (!validation.valid) {
				fetchError = validation.error || 'Invalid video URL';
				isLoading = false;
				value = null;
				return;
			}
			(async () => {
				try {
					const response = await fetch('/api/remoteVideo', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						// Send a JSON object
						body: JSON.stringify({ url, allowedPlatforms: field.allowedPlatforms })
					});
					const result = await response.json();
					if (response.ok && result.success) {
						fetchedMetadata = result.data;
						value = result.data;
					} else {
						fetchError = result.error || 'Failed to fetch video metadata.';
						value = null;
					}
				} catch (e) {
					logger.error('Error fetching video metadata:', e);
					fetchError = 'An unexpected error occurred while fetching video data.';
					value = null;
				} finally {
					isLoading = false;
				}
			})();
		}, 500);
		$$renderer2.push(
			`<div${attr_class('input-container svelte-n7lyz7', void 0, { invalid: error || fetchError })}><label${attr('for', field.db_fieldName)} class="label">Video URL</label> <input type="url"${attr('id', field.db_fieldName)}${attr('name', field.db_fieldName)}${attr('required', field.required, true)}${attr('placeholder', typeof field.placeholder === 'string' ? field.placeholder : 'e.g., https://www.youtube.com/watch?v=dQw4w9WgXcQ')}${attr('value', urlInput)}${attr_class('input svelte-n7lyz7', void 0, { loading: isLoading })}${attr('aria-invalid', !!error || !!fetchError)}${attr('aria-describedby', error || fetchError ? `${field.db_fieldName}-error` : void 0)}/> `
		);
		if (error || fetchError) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<p${attr('id', `${field.db_fieldName}-error`)} class="error-message svelte-n7lyz7" role="alert">${escape_html(error || fetchError)}</p>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--> `);
		if (fetchedMetadata && !isLoading && !fetchError) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="video-preview svelte-n7lyz7"><img${attr('src', fetchedMetadata.thumbnailUrl)}${attr('alt', fetchedMetadata.title)} class="thumbnail svelte-n7lyz7"/> <div class="details svelte-n7lyz7"><h3 class="svelte-n7lyz7">${escape_html(fetchedMetadata.title)}</h3> `
			);
			if (fetchedMetadata.channelTitle) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`<p class="svelte-n7lyz7">By: ${escape_html(fetchedMetadata.channelTitle)}</p>`);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(`<!--]--> `);
			if (fetchedMetadata.duration) {
				$$renderer2.push('<!--[-->');
				$$renderer2.push(`<p class="svelte-n7lyz7">Duration: ${escape_html(fetchedMetadata.duration)}</p>`);
			} else {
				$$renderer2.push('<!--[!-->');
			}
			$$renderer2.push(
				`<!--]--> <a${attr('href', fetchedMetadata.url)} target="_blank" rel="noopener noreferrer" class="watch-link svelte-n7lyz7">Watch on ${escape_html(fetchedMetadata.platform)}</a></div></div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
		}
		$$renderer2.push(`<!--]--></div>`);
	});
}
export { Input as default };
//# sourceMappingURL=Input17.js.map
