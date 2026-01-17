import { e as ensure_array_like, g as attr_class, a as attr, d as escape_html, c as stringify } from './index5.js';
import { d as debounce } from './utils.js';
import { t as tick } from './index-server.js';
function Heatmap($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { content = '', language = 'en', keywords = [], 'on:heatmapGenerated': onHeatmapGenerated = () => {} } = $$props;
		let heatmapData = [];
		let keywordDensity = {};
		debounce.create(() => {
			generateHeatmap();
		}, 300);
		async function generateHeatmap() {
			if (!content) {
				heatmapData = [];
				keywordDensity = {};
				onHeatmapGenerated({ heatmapData, keywordDensity });
				return;
			}
			const words = content.split(/\s+/);
			heatmapData = words.map((word, index) => ({
				word,
				heatLevel: calculateHeatLevel(word, index, words.length, language),
				isKeyword: keywords.includes(word.toLowerCase())
			}));
			analyzeKeywordDensity(words);
			onHeatmapGenerated({ heatmapData, keywordDensity });
			await tick();
		}
		function calculateHeatLevel(word, index, totalWords, lang) {
			let score = 0;
			const positionFactor = 1 - index / totalWords;
			score += positionFactor * 2;
			const idealLength = lang === 'en' ? 5 : 6;
			score += Math.max(0, 3 - Math.abs(word.length - idealLength));
			if (keywords.includes(word.toLowerCase())) {
				score += 2;
			}
			return Math.max(1, Math.min(5, Math.round(score)));
		}
		function analyzeKeywordDensity(words) {
			const totalWords = words.length;
			const result = {};
			for (const keyword of keywords) {
				const count = words.filter((word) => word.toLowerCase() === keyword.toLowerCase()).length;
				result[keyword] = (count / totalWords) * 100;
			}
			keywordDensity = result;
		}
		function getHeatClasses(heatLevel) {
			const heatMap = {
				1: 'bg-green-500/20',
				2: 'bg-yellow-500/20',
				3: 'bg-orange-500/20',
				4: 'bg-red-500/20',
				5: 'bg-purple-500/20'
			};
			return heatMap[heatLevel] || '';
		}
		$$renderer2.push(`<div class="wrap-break-word leading-6 max-sm:text-sm max-sm:leading-tight">`);
		if (
			// Effect to handle content changes with debounced analysis
			// React to content, language, or keywords changes
			// Use the debounced analysis function
			heatmapData.length > 0
		) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<!--[-->`);
			const each_array = ensure_array_like(heatmapData);
			for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
				let { word, heatLevel, isKeyword } = each_array[$$index];
				$$renderer2.push(
					`<span${attr_class(`relative cursor-help ${stringify(getHeatClasses(heatLevel))} ${stringify(isKeyword ? 'border-b-2 border-blue-500' : '')} group`)}${attr('aria-label', `Heat level ${stringify(heatLevel)}: ${stringify(word)}${stringify(isKeyword ? ', keyword' : '')}`)}>${escape_html(word)} <span class="absolute bottom-full left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-800 p-1 text-xs text-white group-hover:block">Heat: ${escape_html(heatLevel)}, ${escape_html(isKeyword ? 'Keyword' : 'Regular word')}</span></span>`
				);
			}
			$$renderer2.push(`<!--]-->`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<p>No content available for heatmap.</p>`);
		}
		$$renderer2.push(`<!--]--></div> <div class="mt-5 text-sm max-sm:text-xs"><h4>Keyword Density</h4> `);
		if (Object.keys(keywordDensity).length > 0) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(`<ul><!--[-->`);
			const each_array_1 = ensure_array_like(Object.entries(keywordDensity));
			for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
				let [keyword, density] = each_array_1[$$index_1];
				$$renderer2.push(`<li>${escape_html(keyword)}: ${escape_html(density.toFixed(2))}%</li>`);
			}
			$$renderer2.push(`<!--]--></ul>`);
		} else {
			$$renderer2.push('<!--[!-->');
			$$renderer2.push(`<p>No keywords provided or no matching keywords found in content.</p>`);
		}
		$$renderer2.push(`<!--]--></div>`);
	});
}
export { Heatmap as default };
//# sourceMappingURL=Heatmap.js.map
